const ftp = require("basic-ftp");
// const multer = require("multer");
const fs = require("fs");
const path = require("path");


// FTP 配置
const ftpConfig = {
    host: "13.58.29.104", // FTP 服务器地址
    user: "ftpuser", // FTP 用户名
    password: "uf@Docs2024_10?", // FTP 密码
};

// 使用 multer 处理文件上传到本地临时目录
// const upload = multer({
//     dest: "uploads/"
// });

// 上传到 FTP 的函数
const uploadToFTP = async (localFilePath, remoteFilePath) => {
    const client = new ftp.Client();
    client.ftp.verbose = true; // 可选，打印上传过程日志

    try {
        await client.access(ftpConfig);
        console.log("成功连接到 FTP 服务器");

        // 上传文件
        // await client.uploadFrom(localFilePath, remoteFilePath);
        // console.log(`文件已上传到 FTP: ${remoteFilePath}`);
    } catch (error) {
        console.error("文件上传失败:", error);
        throw error;
    } finally {
        client.close();
    }
};


async function init() {
    const client = new ftp.Client();
    client.ftp.verbose = true; // 可选，打印上传过程日志

    try {
        await client.access(ftpConfig);
        console.log("成功连接到 FTP 服务器");

        // 上传文件
        // await client.uploadFrom(localFilePath, remoteFilePath);
        // console.log(`文件已上传到 FTP: ${remoteFilePath}`);
    } catch (error) {
        console.error("文件上传失败:", error);
        throw error;
    } finally {
        client.close();
    }
}

init();

// // 处理上传请求
// app.post("/upload", upload.single("file"), async (req, res) => {
//     const file = req.file;
//     if (!file) {
//         return res.status(400).send("未找到文件");
//     }

//     const localFilePath = file.path;
//     const remoteFilePath = `/uploads/${file.originalname}`; // 目标 FTP 路径

//     try {
//         await uploadToFTP(localFilePath, remoteFilePath);
//         res.status(200).send({
//             message: "文件上传成功",
//             remotePath: remoteFilePath
//         });
//     } catch (error) {
//         res.status(500).send({
//             message: "文件上传失败",
//             error: error.message
//         });
//     } finally {
//         // 删除本地临时文件
//         fs.unlinkSync(localFilePath);
//     }
// });

// // 启动服务器
// app.listen(PORT, () => {
//     console.log(`服务器运行在 http://localhost:${PORT}`);
// });