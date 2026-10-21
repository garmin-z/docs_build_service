const {
    execFile
} = require("child_process");

const {
    sendWs,
    send
} = require("../libs/ws");

const jobState = require("../libs/job-state");
const configs = require("../libs/configs");
const { getFirstPagePath } = require("../libs/doc-first-page");

// 文档类型来自配置文件
function findDocConfig(docs) {
    return configs.get().docs.find((doc) => doc.value === docs);
}

// 把配置转成脚本环境变量（shell 脚本里用 ${DOCS_xxx:-默认值} 兜底）
function buildScriptEnv(docs) {
    const current = configs.get();
    const doc = current.docs.find((item) => item.value === docs) || {};
    return {
        ...process.env,
        DOCS_ROOT: current.deployRoot,
        DOCS_LOG_DIR: current.logDir,
        DOCS_PREVIEW_PORT: String(current.previewPort),
        DOCS_GIT_REPO: current.gitRepo,
        DOCS_GIT_PROXY: current.gitProxy || "",
        DOCS_BRANCH: doc.branch || `ufactory_doc_${docs}`,
        DOCS_PUBLISH_HOST: current.publish.host,
        DOCS_PUBLISH_USER: current.publish.user,
        DOCS_PUBLISH_DIR: current.publish.remoteDir
    };
}

// 按顺序执行多个脚本，任一脚本失败则中止并通知前端
async function executeScriptsSequentially(scripts, env) {
    for (const script of scripts) {
        try {
            await executeScript({
                ...script,
                env
            });
        } catch (err) {
            sendWs(`有脚本执行出错：${err.message}。请重试`);
            return false;
        }
    }
    return true;
}

// 统一入口：校验参数、加互斥锁、串行执行脚本
async function startJob(req, rsp, buildScripts, onSuccess) {
    try {
        const docs = req.body && req.body.docs;

        // 文档列表来自 git 分支：本地配置里没有时，立即与远端同步一次再判断
        if (!findDocConfig(docs)) {
            await configs.syncDocs(true);
        }

        if (!findDocConfig(docs)) {
            return rsp.status(400).send({ message: `无效的文档类型：${docs}` });
        }

        if (jobState.isRunning()) {
            return rsp.status(409).send({ message: "已有任务正在执行，请等待完成后再操作" });
        }

        const env = buildScriptEnv(docs);
        jobState.setRunning(true);
        rsp.status(200).send({ message: "脚本执行中" });
        // 通知所有页面任务开始，前端据此显示加载状态
        send({ job: { running: true } });

        executeScriptsSequentially(buildScripts(docs), env)
            .then((ok) => {
                if (ok && onSuccess) {
                    onSuccess(docs);
                }
            })
            .finally(() => {
                jobState.setRunning(false);
                send({ job: { running: false } });
            });
    } catch (err) {
        sendWs(`任务启动失败：${err.message}`);
        if (!rsp.headersSent) {
            rsp.status(500).send({ message: err.message });
        }
    }
}

function pull(req, rsp) {
    startJob(req, rsp, (docs) => [
        { file: "./shells/kill_preview.sh" },
        { file: "./shells/pull.sh", args: [docs] }
    ]);
}


function build(req, rsp) {
    startJob(req, rsp, (docs) => [
        { file: "./shells/kill_preview.sh" },
        { file: "./shells/build.sh", args: [docs] }
    ]);
}


function publish(req, rsp) {
    startJob(req, rsp, (docs) => [
        { file: "./shells/kill_preview.sh" },
        { file: "./shells/rsync.sh", args: [docs] }
    ]);
}


function preview(req, rsp) {
    startJob(req, rsp, (docs) => [
        { file: "./shells/kill_preview.sh" },
        { file: "./shells/preview.sh", args: [docs] }
    ], async (docs) => {
        // 第一页识别失败时 path 为空字符串，链接退回站点根路径
        const firstPage = await getFirstPagePath(docs);
        if (firstPage.error) {
            sendWs(`未能自动识别第一页（${firstPage.error}），预览链接将打开站点根路径`);
        }
        // 预览启动成功后把第一页路径推给前端，由前端拼上当前主机名和 3040 端口
        send({
            preview: {
                docs,
                path: firstPage.path
            }
        });
    });
}


// 执行单个脚本，逐行转发 stdout/stderr
function executeScript({
    file,
    args = [],
    timeout = 30 * 60 * 1000,
    env = process.env
}) {
    return new Promise((resolve, reject) => {
        const displayName = [file, ...args].join(" ");
        sendWs(`开始脚本${displayName}：`);

        // 用 bash 显式执行脚本：不依赖文件的执行权限，参数也不经过 shell 拼接；
        // maxBuffer 增大，避免构建日志超限导致子进程被杀死
        const deployProcess = execFile("bash", [file, ...args], {
            env,
            maxBuffer: 10 * 1024 * 1024,
            timeout
        });

        // 按行转发输出：一个数据块可能包含多行，也可能只有半行
        const forwardStream = (stream, prefix) => {
            let buffer = "";
            stream.setEncoding("utf8");
            stream.on("data", (chunk) => {
                buffer += chunk;
                const lines = buffer.split("\n");
                buffer = lines.pop();
                lines.forEach((line) => {
                    if (line.trim()) {
                        sendWs(`${prefix}${line}`);
                    }
                });
            });
            stream.on("end", () => {
                if (buffer.trim()) {
                    sendWs(`${prefix}${buffer}`);
                }
            });
        };

        forwardStream(deployProcess.stdout, "");
        // git 等工具会把进度、提示信息写到 stderr，并不代表执行出错，
        // 这里只标记来源；成功与否以退出码为准
        forwardStream(deployProcess.stderr, "[stderr] ");

        deployProcess.on("error", (err) => {
            sendWs(`脚本${displayName}启动失败：${err.message}`);
            reject(err);
        });

        deployProcess.on("close", (code, signal) => {
            if (signal) {
                sendWs(`脚本${displayName}被终止（${signal}），可能是执行超时`);
                return reject(new Error(`脚本${displayName}被终止（${signal}）`));
            }
            sendWs(`脚本${displayName}执行完成，退出码：${code}`);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`脚本${displayName}执行出错，退出码：${code}`));
            }
        });
    });
}


module.exports = {
    pull,
    build,
    publish,
    preview
};
