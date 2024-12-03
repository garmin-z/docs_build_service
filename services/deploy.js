const {
    exec
} = require("child_process");

const {
    sendWs
} = require("../libs/ws");


async function executeScriptsSequentially(scriptPaths, sendWs) {
    for (let i = 0; i < scriptPaths.length; i++) {
        const scriptPath = scriptPaths[i];
        try {
            await executeScript(scriptPath, sendWs);
        } catch (err) {
            sendWs(`有脚本执行出错：${err.message}`);
            break;
        }
    }
}

function index(req, rsp) {
    const scriptPaths = ["./shells/pull.sh", "./shells/build.sh", "./shells/rsync.sh"];
    rsp.status(200).send({
        message: "脚本执行中，日志通过 WebSocket 发送"
    });
    executeScriptsSequentially(scriptPaths, sendWs);
}

function executeScript(scriptPath, sendWs) {
    return new Promise((resolve, reject) => {
        const deployProcess = exec(`${scriptPath}`);
        deployProcess.stdout.on("data", (data) => {
            sendWs(data);
        });
        deployProcess.stderr.on("data", (data) => sendWs(`ERROR: ${data}`));
        deployProcess.on("close", (code) => {
            sendWs(`脚本${scriptPath}执行完成，退出码：${code}`);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`脚本${scriptPath}执行出错，退出码：${code}`));
            }
        });
    });
}



function preview(req, rsp) {
    const deployProcess = exec(`cd /app/ufactory-docs && npm run preview`);
    deployProcess.stdout.on("data", (data) => sendWs(data));
    deployProcess.stderr.on("data", (data) => sendWs(`ERROR: ${data}`));
    deployProcess.on("close", (code) => {
        sendWs(`脚本执行完成，退出码：${code}`);
        rsp.status(200).send({
            message: "脚本执行中，日志通过 WebSocket 发送"
        });
    });
}

module.exports = {
    index,
    preview
}