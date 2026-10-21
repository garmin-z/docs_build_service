const getAppInstance = require("./libs/router");
const {
    newWebSocketServerInstance,
    sendWs,
    send
} = require("./libs/ws");
const jobState = require("./libs/job-state");
const siteCheck = require("./libs/site-check");

let siteCheckRunning = false;



// 创建ws
const wss = newWebSocketServerInstance()


const PROT = 3000;

// 创建服务
const app = getAppInstance(PROT)


app.server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        ws.on("message", (message) => {
            // 客户端可能发送非 JSON 消息，解析失败时只记录，不能让进程崩溃
            let payload;
            try {
                payload = JSON.parse(message);
            } catch (err) {
                console.error(`收到非 JSON 消息，已忽略: ${message}`);
                return;
            }
            if (payload && payload.cmd === "heartbeat") {
                send({
                    cmd: "heartbeat",
                    data: "ok"
                })
            }
            // 客户端主动查询任务状态（页面刷新/重连后恢复加载图标）
            if (payload && payload.cmd === "status") {
                send({
                    job: {
                        running: jobState.isRunning()
                    }
                });
            }
            // 站点检查：每检查完一个站点就推送给页面显示
            if (payload && payload.cmd === "site-check" && !siteCheckRunning) {
                siteCheckRunning = true;
                siteCheck.checkAllStreaming((item) => {
                        send({
                            site: item
                        });
                    })
                    .then((result) => {
                        send({
                            siteDone: result
                        });
                    })
                    .catch((err) => {
                        send({
                            siteError: {
                                message: err.message
                            }
                        });
                    })
                    .finally(() => {
                        siteCheckRunning = false;
                    });
            }
            console.log(`Received: ${message}`)
        });
        wss.emit("connection", ws, request);
    });
});