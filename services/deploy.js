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

function pull(req, rsp) {
    const scriptPaths = ["./shells/kill_preview.sh", "./shells/pull.sh"];
    rsp.status(200).send({
        message: "脚本执行中"
    });
    executeScriptsSequentially(scriptPaths, sendWs);
}


function build(req, rsp) {
    const scriptPaths = ["./shells/kill_preview.sh", "./shells/build.sh"];
    rsp.status(200).send({
        message: "脚本执行中"
    });
    executeScriptsSequentially(scriptPaths, sendWs);
}


function publish(req, rsp) {
    const scriptPaths = ["./shells/kill_preview.sh", "./shells/rsync.sh"];
    rsp.status(200).send({
        message: "脚本执行中"
    });
    executeScriptsSequentially(scriptPaths, sendWs);
}

function preview(req, rsp) {
    const scriptPaths = ["./shells/kill_preview.sh", "./shells/preview.sh"];
    rsp.status(200).send({
        message: "脚本执行中"
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





module.exports = {
    pull,
    build,
    publish,
    preview
}