const fs = require("fs");
const path = require("path");

// 配置文件默认放在 /app/config/settings.json（可通过环境变量覆盖，便于本地调试）
const SETTINGS_FILE = process.env.DOCS_SETTINGS_FILE || "/app/config/settings.json";

// 默认文档列表：顺序即页面上的展示顺序
const DEFAULT_DOCS = [
    { value: "usermanual", label: "User Manual", branch: "ufactory_doc_usermanual" },
    { value: "api", label: "Api", branch: "ufactory_doc_api" },
    { value: "support_article", label: "Support Article", branch: "ufactory_doc_support_article" },
    { value: "xarm", label: "Xarm", branch: "ufactory_doc_xarm" },
    { value: "850", label: "850", branch: "ufactory_doc_850" },
    { value: "lite6", label: "Lite6", branch: "ufactory_doc_lite6" },
    { value: "accessories", label: "Accessories", branch: "ufactory_doc_accessories" },
    { value: "releasenote", label: "Releasenote", branch: "ufactory_doc_releasenote" }
];

const DEFAULTS = {
    docs: DEFAULT_DOCS,
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

const DOC_VALUE_RE = /^[a-z0-9_]+$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;
const HOST_RE = /^[A-Za-z0-9.-]+$/;
const USER_RE = /^[A-Za-z0-9._-]+$/;
const URL_RE = /^(https?:\/\/|git@|ssh:\/\/)\S+$/;

function isValidHttpUrl(value) {
    return /^https?:\/\/\S+$/.test(value);
}

function isAbsolute(value) {
    return typeof value === "string" && value.startsWith("/") && !value.includes("\n");
}

// 校验并整理设置内容，返回可直接保存的对象
function validate(input) {
    if (!input || typeof input !== "object") {
        throw new Error("设置内容格式不正确");
    }

    if (!Array.isArray(input.docs) || input.docs.length === 0) {
        throw new Error("文档列表不能为空");
    }

    const seen = new Set();
    const docs = input.docs.map((doc, index) => {
        const value = String((doc && doc.value) || "").trim();
        const label = String((doc && doc.label) || "").trim();
        const branch = String((doc && doc.branch) || "").trim();

        if (!DOC_VALUE_RE.test(value)) {
            throw new Error(`第 ${index + 1} 个文档的标识只能包含小写字母、数字、下划线：${value}`);
        }
        if (seen.has(value)) {
            throw new Error(`文档标识重复：${value}`);
        }
        if (!label) {
            throw new Error(`文档 ${value} 缺少显示名称`);
        }
        if (branch && !BRANCH_RE.test(branch)) {
            throw new Error(`文档 ${value} 的分支名不合法：${branch}`);
        }
        seen.add(value);
        return { value, label, branch };
    });

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
    if (gitProxy && !isValidHttpUrl(gitProxy)) {
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
        docs,
        gitRepo,
        gitProxy,
        deployRoot,
        logDir,
        previewPort,
        publish: { host, user, remoteDir }
    };
}

function load() {
    try {
        const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
        return validate(JSON.parse(raw));
    } catch (err) {
        if (err.code !== "ENOENT") {
            console.error(`读取配置文件失败，使用默认配置：${err.message}`);
        }
        return validate(DEFAULTS);
    }
}

let current = load();

function save(next) {
    const dir = path.dirname(SETTINGS_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${SETTINGS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    fs.renameSync(tmp, SETTINGS_FILE);
    current = next;
    return current;
}

module.exports = {
    // 返回当前配置的副本，避免调用方意外修改
    get() {
        return JSON.parse(JSON.stringify(current));
    },
    // 校验并保存新配置
    update(input) {
        return save(validate(input));
    },
    file: SETTINGS_FILE
};
