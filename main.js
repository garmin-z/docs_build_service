const getAppInstance = require("./libs/router");
const {
    newWebSocketServerInstance,
    sendWs,
    send
} = require("./libs/ws");



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
            console.log(`Received: ${message}`)
        });
        wss.emit("connection", ws, request);
    });
});