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
        app.locals.wsConnection = ws; // 存储 WebSocket 连接
        ws.on("message", (message) => {
            const {
                cmd
            } = JSON.parse(message)
            if (cmd === "heartbeat") {
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