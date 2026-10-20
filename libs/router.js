const express = require("express");
const deploy = require("../services/deploy");
const configs = require("./configs");
const jobState = require("./job-state");
const { send } = require("./ws");
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

        appInstance.get("/favicon.ico", (req, rsp) => {
            rsp.sendFile(path.join(__dirname, '../views', 'favicon.ico'));
        });

        // 配置读取/保存
        appInstance.get("/settings", (req, rsp) => {
            // 先用 config.json 里的配置立即响应（页面刷新默认取本地配置）
            rsp.json(configs.get());
            // 随后在后台与 git ls-remote 同步，有差异会写回 config.json 并推送页面
            configs.syncDocs().catch((err) => {
                console.error(`同步文档分支失败：${err.message}`);
            });
        });

        appInstance.put("/settings", (req, rsp) => {
            if (jobState.isRunning()) {
                return rsp.status(409).send({ message: "有任务正在执行，暂时不能修改设置" });
            }
            try {
                rsp.json(configs.update(req.body));
            } catch (err) {
                rsp.status(400).send({ message: err.message });
            }
        });

        // 分支列表有差异并写回 config.json 后，推送页面更新文档列表
        configs.onDocsChanged((docs) => {
            send({
                docs
            });
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