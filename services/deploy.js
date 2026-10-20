const {
    execFile
} = require("child_process");

const {
    sendWs,
    send
} = require("../libs/ws");

const {
    getFirstPagePath
} = require("../libs/preview-paths");

// 允许操作的文档类型白名单，白名单之外一律拒绝
const ALLOWED_DOCS = new Set([
    "xarm",
    "lite6",
    "850",
    "api",
    "support_article",
    "accessories",
    "releasenote",
    "usermanual"
]);

// 同一时间只允许一个任务执行，避免多个 git/npm 进程并发操作同一个目录
let isRunning = false;

// 按顺序执行多个脚本，任一脚本失败则中止并通知前端
async function executeScriptsSequentially(scripts) {
    for (const script of scripts) {
        try {
            await executeScript(script);
        } catch (err) {
            sendWs(`有脚本执行出错：${err.message}。请重试`);
            return false;
        }
    }
    return true;
}

// 统一入口：校验参数、加互斥锁、串行执行脚本
function startJob(req, rsp, buildScripts, onSuccess) {
    const docs = req.body && req.body.docs;

    if (!ALLOWED_DOCS.has(docs)) {
        return rsp.status(400).send({ message: `无效的文档类型：${docs}` });
    }

    if (isRunning) {
        return rsp.status(409).send({ message: "已有任务正在执行，请等待完成后再操作" });
    }

    isRunning = true;
    rsp.status(200).send({ message: "脚本执行中" });

    executeScriptsSequentially(buildScripts(docs))
        .then((ok) => {
            if (ok && onSuccess) {
                onSuccess(docs);
            }
        })
        .finally(() => {
            isRunning = false;
        });
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
    ], (docs) => {
        // 预览启动成功后把第一页路径推给前端，由前端拼上当前主机名和 3040 端口
        send({
            preview: {
                docs,
                path: getFirstPagePath(docs)
            }
        });
    });
}


// 执行单个脚本，逐行转发 stdout/stderr
function executeScript({
    file,
    args = [],
    timeout = 30 * 60 * 1000
}) {
    return new Promise((resolve, reject) => {
        const displayName = [file, ...args].join(" ");
        sendWs(`开始脚本${displayName}：`);

        // 用 bash 显式执行脚本：不依赖文件的执行权限，参数也不经过 shell 拼接；
        // maxBuffer 增大，避免构建日志超限导致子进程被杀死
        const deployProcess = execFile("bash", [file, ...args], {
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
