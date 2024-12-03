const WebSocket = require("ws");

// 用于存储WebSocket服务器单例实例和连接的客户端
let webSocketServerInstance;
let connectedClients = [];

// 创建并返回WebSocket服务器单例实例的函数
const newWebSocketServerInstance = () => {
    if (!webSocketServerInstance) {
        // 初始化 WebSocket 服务器
        webSocketServerInstance = new WebSocket.Server({
            noServer: true
        });

        // 处理客户端连接
        webSocketServerInstance.on("connection", (ws) => {
            // 添加新客户端到连接列表
            connectedClients.push(ws);

            // 发送初始日志给新客户端
            sendWs("连接成功!");

            // 设置客户端事件监听器
            handleClientEvents(ws);
        });
    }

    return webSocketServerInstance;
};

// 处理客户端 WebSocket 的事件
const handleClientEvents = (ws) => {
    // 当接收到客户端消息时的处理函数
    ws.on("message", (message) => {
        console.log(`收到客户端消息: ${message}`);
        // 在这里处理客户端的消息
    });

    // 当客户端关闭连接时的处理函数
    ws.on("close", () => {
        console.log("客户端已断开连接");
        connectedClients = connectedClients.filter((client) => client !== ws);
    });

    // 当发生错误时的处理函数
    ws.on("error", (error) => {
        console.error(`客户端连接错误: ${error}`);
    });
};

// 处理日志发送，确保消息能正确发送给所有已连接的客户端
const sendWs = (message) => {
    connectedClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({
                    log: message
                }));
            } catch (error) {
                console.error(`发送日志给客户端时出错: ${error}`);
            }
        }
    });
};

// 导出获取WebSocket服务器单例实例的函数和处理日志发送的函数
module.exports = {
    newWebSocketServerInstance,
    sendWs
};