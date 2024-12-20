const express = require("express");
const deploy = require("../services/deploy");
const cors = require("cors");
const path = require("path");
const bodyParser = require('body-parser');
// 定义一个变量来存储Express应用的单例实例
let appInstance;

// 定义一个函数来创建并返回Express应用的单例实例
const getAppInstance = (port = 3000) => {
    if (!appInstance) {
        // 如果实例不存在，则创建一个新的Express应用实例
        appInstance = express();
        appInstance.use(cors());
        // 配置解析JSON格式请求体的中间件
        appInstance.use(bodyParser.json());

        // WebSocket Upgrade
        appInstance.server = appInstance.listen(port, "0.0.0.0", () => {
            console.log(`Server running on http://localhost:${port}`);
        });

        appInstance.get("/", (req, rsp) => {
            rsp.sendFile(path.join(__dirname, '../views', 'index.html'));
        });

        // 部署端点
        // appInstance.get("/deploy", deploy.index);
        appInstance.post("/pull", deploy.pull);
        appInstance.post("/build", deploy.build);
        appInstance.post("/publish", deploy.publish);
        appInstance.post("/preview", deploy.preview);

    }

    // 返回Express应用的单例实例
    return appInstance;
};

// 导出获取Express应用单例实例的函数
module.exports = getAppInstance;