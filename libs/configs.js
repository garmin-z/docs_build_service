// 站点配置。
// - 文档列表不写死：每次从 git 仓库获取 ufactory_doc_ 前缀的分支，分支名去掉前缀即文档标识。
// - 其他配置优先读取服务根目录下的 config.json（/app/config.json）；文件不存在时自动按默认值创建。
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const CONFIG_FILE = path.join(__dirname, "..", "config.json");
const DOC_BRANCH_PREFIX = "ufactory_doc_";
const DOCS_TTL = 5 * 60 * 1000;

const DEFAULTS = {
    gitRepo: "https://github.com/xArm-Developer/ufactory_docs.git",
    gitProxy: "http://192.168.1.176:8016",
    deployRoot: "/app/ufactory_docs",
    logDir: "/app/logs",
    previewPort: 3040,
    publish: {
        host: "3.138.33.79",
        user: "ec2-user",
        remoteDir: "/home/ec2-user/ufactory_docs"
    }
};

const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;
const HOST_RE = /^[A-Za-z0-9.-]+$/;
const USER_RE = /^[A-Za-z0-9._-]+$/;
const URL_RE = /^(https?:\/\/|git@|ssh:\/\/)\S+$/;
const DOC_VALUE_RE = /^[a-z0-9_]+$/;

function isAbsolute(value) {
    return typeof value === "string" && value.startsWith("/") && !value.includes("\n");
}

// 校验 config.json 中的配置项（文档列表来自 git，不在此校验）
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
        gitRepo,
        gitProxy,
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

// config.json 不存在时按默认配置创建
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

// 文档列表缓存
let docsCache = {
    list: [],
    fetchedAt: 0
};
let refreshPromise = null;

// "support_article" -> "Support Article"
function buildLabel(value) {
    return value
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

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

async function fetchDocs() {
    const env = {
        ...process.env
    };
    if (current.gitProxy) {
        env.http_proxy = current.gitProxy;
        env.https_proxy = current.gitProxy;
    }

    try {
        const {
            stdout
        } = await execFileAsync("git", ["ls-remote", "--heads", current.gitRepo], {
            env,
            timeout: 20 * 1000,
            maxBuffer: 4 * 1024 * 1024
        });
        const list = parseDocBranches(stdout);
        docsCache = {
            list,
            fetchedAt: Date.now()
        };
        return list;
    } catch (err) {
        console.error(`从 Git 获取文档分支失败：${err.message.split("\n")[0]}`);
        return docsCache.list;
    }
}

// 拉取（或刷新）文档列表；并发调用共享同一个请求
function refreshDocs() {
    if (!refreshPromise) {
        refreshPromise = fetchDocs().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

// 缓存过期时刷新一次，返回最新列表
async function ensureDocs() {
    if (docsCache.list.length > 0 && Date.now() - docsCache.fetchedAt < DOCS_TTL) {
        return docsCache.list;
    }
    return refreshDocs();
}

module.exports = {
    // 返回当前配置的副本（含从 Git 获取的文档列表）
    get() {
        return {
            ...JSON.parse(JSON.stringify(current)),
            docs: JSON.parse(JSON.stringify(docsCache.list))
        };
    },
    // 校验并写入 config.json（文档列表来自 Git，不接受页面传入）
    update(input) {
        const next = validate(input);
        writeConfig(next);
        current = next;
        // 仓库地址或代理可能变了，刷新文档列表
        refreshDocs();
        return this.get();
    },
    // 刷新或等待文档列表（供页面加载、任务执行前调用）
    ensureDocs,
    refreshDocs,
    parseDocBranches,
    file: CONFIG_FILE
};

// 启动后异步拉取一次文档列表
refreshDocs();
