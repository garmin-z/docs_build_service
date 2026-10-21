// 站点配置。
// - 配置（含文档列表）直接保存在服务根目录下的 config.json（/app/config.json），
//   文件不存在时自动创建。
// - 页面加载时先返回 config.json 中的文档列表；随后在后台执行 git ls-remote，
//   发现 ufactory_doc_ 前缀的分支与配置不一致时，把差异合并写回 config.json，
//   并通过 WebSocket 推送给页面。
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const CONFIG_FILE = path.join(__dirname, "..", "config.json");
const DOC_BRANCH_PREFIX = "ufactory_doc_";
// 两次 git 同步之间的最小间隔，避免频繁刷新页面时反复请求远端
const SYNC_MIN_INTERVAL = 5 * 1000;

const events = new EventEmitter();

const DEFAULTS = {
    docs: [],
    gitRepo: "https://github.com/xArm-Developer/ufactory_docs.git",
    gitProxy: "http://192.168.1.176:8016",
    siteProxy: "",
    deployRoot: "/app/ufactory_docs",
    logDir: "/app/logs",
    previewPort: 3040,
    publish: {
        host: "3.138.33.79",
        user: "ec2-user",
        remoteDir: "/home/ec2-user/ufactory_docs"
    }
};

const DOC_VALUE_RE = /^[a-z0-9_]+$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;
const HOST_RE = /^[A-Za-z0-9.-]+$/;
const USER_RE = /^[A-Za-z0-9._-]+$/;
const URL_RE = /^(https?:\/\/|git@|ssh:\/\/)\S+$/;

function isAbsolute(value) {
    return typeof value === "string" && value.startsWith("/") && !value.includes("\n");
}

// "support_article" -> "Support Article"
function buildLabel(value) {
    return value
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

// 校验并整理文档列表（允许为空：首次启动时由 git 同步填充）
function validateDocs(input) {
    if (input === undefined || input === null) {
        return [];
    }
    if (!Array.isArray(input)) {
        throw new Error("文档列表格式不正确");
    }

    const seen = new Set();
    return input.map((doc, index) => {
        const value = String((doc && doc.value) || "").trim();
        if (!DOC_VALUE_RE.test(value)) {
            throw new Error(`第 ${index + 1} 个文档的标识只能包含小写字母、数字、下划线：${value}`);
        }
        if (seen.has(value)) {
            throw new Error(`文档标识重复：${value}`);
        }
        const label = String((doc && doc.label) || "").trim() || buildLabel(value);
        const branch = String((doc && doc.branch) || "").trim() || `${DOC_BRANCH_PREFIX}${value}`;
        if (!BRANCH_RE.test(branch)) {
            throw new Error(`文档 ${value} 的分支名不合法：${branch}`);
        }
        seen.add(value);
        return { value, label, branch };
    });
}

// 校验 config.json 中的配置项
function validate(input) {
    if (!input || typeof input !== "object") {
        throw new Error("设置内容格式不正确");
    }

    const previewPort = Number(input.previewPort);
    if (!Number.isInteger(previewPort) || previewPort < 1 || previewPort > 65535) {
        throw new Error("预览端口必须是 1-65535 之间的整数");
    }

    const deployRoot = String(input.deployRoot || "").trim();
    if (!isAbsolute(deployRoot)) {
        throw new Error("部署根目录必须是绝对路径");
    }

    const logDir = String(input.logDir || "").trim();
    if (!isAbsolute(logDir)) {
        throw new Error("日志目录必须是绝对路径");
    }

    const gitRepo = String(input.gitRepo || "").trim();
    if (!URL_RE.test(gitRepo)) {
        throw new Error("Git 仓库地址不合法");
    }

    const gitProxy = String(input.gitProxy || "").trim();
    if (gitProxy && !/^https?:\/\/\S+$/.test(gitProxy)) {
        throw new Error("代理地址不合法（形如 http://host:port）");
    }

    // 站点检查专用代理；留空时回退到 gitProxy
    const siteProxy = String(input.siteProxy || "").trim();
    if (siteProxy && !/^https?:\/\/\S+$/.test(siteProxy)) {
        throw new Error("站点检查代理地址不合法（形如 http://host:port）");
    }

    const publish = input.publish || {};
    const host = String(publish.host || "").trim();
    const user = String(publish.user || "").trim();
    const remoteDir = String(publish.remoteDir || "").trim();

    if (!HOST_RE.test(host)) {
        throw new Error("发布服务器地址不合法");
    }
    if (!USER_RE.test(user)) {
        throw new Error("发布用户名不合法");
    }
    if (!isAbsolute(remoteDir)) {
        throw new Error("远程目录必须是绝对路径");
    }

    return {
        docs: validateDocs(input.docs),
        gitRepo,
        gitProxy,
        siteProxy,
        deployRoot,
        logDir,
        previewPort,
        publish: { host, user, remoteDir }
    };
}

// 以默认配置为底，用 config.json 覆盖（config.json 优先，缺的字段用默认值补齐）
function withDefaults(input) {
    const source = input && typeof input === "object" ? input : {};
    return validate({
        ...DEFAULTS,
        ...source,
        publish: {
            ...DEFAULTS.publish,
            ...(source.publish && typeof source.publish === "object" ? source.publish : {})
        }
    });
}

function writeConfig(config) {
    const tmp = `${CONFIG_FILE}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(config, null, 4)}\n`, "utf8");
    fs.renameSync(tmp, CONFIG_FILE);
}

// config.json 不存在时按默认配置创建（文档列表由启动时的 git 同步填充）
function ensureConfigFile() {
    if (fs.existsSync(CONFIG_FILE)) {
        return;
    }
    try {
        writeConfig(withDefaults({}));
        console.log(`已创建默认配置文件：${CONFIG_FILE}`);
    } catch (err) {
        console.error(`创建 config.json 失败，本次使用内置默认配置：${err.message}`);
    }
}

function load() {
    ensureConfigFile();
    try {
        const raw = fs.readFileSync(CONFIG_FILE, "utf8");
        return withDefaults(JSON.parse(raw));
    } catch (err) {
        console.error(`读取 config.json 失败，使用内置默认配置：${err.message}`);
        return withDefaults({});
    }
}

let current = load();

// 从 git ls-remote 输出中解析 ufactory_doc_ 前缀的分支
function parseDocBranches(stdout) {
    const docs = [];
    for (const line of String(stdout).split("\n")) {
        const ref = line.split("\t")[1];
        if (!ref) {
            continue;
        }
        const branch = ref.replace(/^refs\/heads\//, "").trim();
        if (!branch.startsWith(DOC_BRANCH_PREFIX)) {
            continue;
        }
        const value = branch.slice(DOC_BRANCH_PREFIX.length);
        if (!DOC_VALUE_RE.test(value)) {
            continue;
        }
        docs.push({
            value,
            label: buildLabel(value),
            branch
        });
    }
    docs.sort((a, b) => a.value.localeCompare(b.value));
    return docs;
}

// 文档列表是否一致（只比较标识和分支；显示名以配置里的为准）
function sameDocs(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((doc, index) => doc.value === b[index].value && doc.branch === b[index].branch);
}

// 合并远端分支：保留现有顺序和自定义显示名，新增的追加在后面，远端已删除的移除
function mergeDocs(existing, remote) {
    const remoteMap = new Map(remote.map((doc) => [doc.value, doc]));
    const merged = [];
    for (const doc of existing) {
        const remoteDoc = remoteMap.get(doc.value);
        if (!remoteDoc) {
            continue;
        }
        merged.push({
            value: doc.value,
            label: doc.label || remoteDoc.label,
            branch: remoteDoc.branch
        });
        remoteMap.delete(doc.value);
    }
    const added = Array.from(remoteMap.values()).sort((a, b) => a.value.localeCompare(b.value));
    merged.push(...added);
    return merged;
}

let lastSyncAt = 0;
let syncPromise = null;

// 与 git 同步文档分支；有差异时写回 config.json 并通知订阅者
async function doSync() {
    const env = {
        ...process.env
    };
    if (current.gitProxy) {
        env.http_proxy = current.gitProxy;
        env.https_proxy = current.gitProxy;
    }

    let stdout;
    try {
        ({
            stdout
        } = await execFileAsync("git", ["ls-remote", "--heads", current.gitRepo], {
            env,
            timeout: 20 * 1000,
            maxBuffer: 4 * 1024 * 1024
        }));
    } catch (err) {
        console.error(`从 Git 同步文档分支失败：${String(err.message).split("\n")[0]}`);
        return { updated: false, docs: current.docs };
    }
    lastSyncAt = Date.now();

    const remote = parseDocBranches(stdout);
    if (remote.length === 0) {
        // 远端一个分支都没拿到时不覆盖本地配置
        return { updated: false, docs: current.docs };
    }

    const merged = mergeDocs(current.docs, remote);
    if (sameDocs(current.docs, merged)) {
        return { updated: false, docs: current.docs };
    }

    current = { ...current, docs: merged };
    try {
        writeConfig(current);
        console.log(`文档分支有变化，已更新 ${CONFIG_FILE}：${merged.map((doc) => doc.value).join(", ")}`);
    } catch (err) {
        console.error(`写入 config.json 失败（本次运行内仍生效）：${err.message}`);
    }
    events.emit("docs", JSON.parse(JSON.stringify(merged)));
    return { updated: true, docs: merged };
}

// 触发同步；force=true 时忽略最小间隔（用于校验失败后的立即刷新）
function syncDocs(force = false) {
    if (syncPromise) {
        return syncPromise;
    }
    if (!force && Date.now() - lastSyncAt < SYNC_MIN_INTERVAL) {
        return Promise.resolve({ updated: false, docs: current.docs });
    }
    syncPromise = doSync().finally(() => {
        syncPromise = null;
    });
    return syncPromise;
}

module.exports = {
    // 返回当前配置的副本（含 config.json 中的文档列表）
    get() {
        return JSON.parse(JSON.stringify(current));
    },
    // 校验并写入 config.json；文档列表只能通过 git 同步更新，忽略传入值
    update(input) {
        const next = validate(input);
        next.docs = current.docs;
        writeConfig(next);
        current = next;
        // 仓库地址或代理可能变了，立即刷新分支列表
        syncDocs(true);
        return this.get();
    },
    syncDocs,
    parseDocBranches,
    // 订阅文档列表变化（同步到差异并写回 config.json 后触发）
    onDocsChanged(listener) {
        events.on("docs", listener);
    },
    file: CONFIG_FILE
};

// 启动后异步同步一次
syncDocs(true);
