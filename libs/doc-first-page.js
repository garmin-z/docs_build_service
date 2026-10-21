// 动态获取文档第一页：加载文档仓库的 VitePress 配置，取侧边栏第一个链接，
// 文档结构变化后无需改代码；识别失败时返回空路径（链接退回站点根路径）。
// 预览和站点检查共用这一份逻辑，保证两者打开的是同一个“第一页”。
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const configs = require("./configs");

const execFileAsync = promisify(execFile);

// 返回 { path, error }：path 为空字符串表示未识别到第一页，error 为失败原因摘要
async function getFirstPagePath(docs) {
    const repoPath = path.join(configs.get().deployRoot, docs);
    const outFile = path.join(os.tmpdir(), `first-page-${docs}-${process.pid}-${Date.now()}.txt`);

    try {
        await execFileAsync("node", [
            path.join(__dirname, "../shells/first-page.js"),
            repoPath,
            outFile
        ], {
            cwd: repoPath,
            timeout: 30 * 1000,
            maxBuffer: 1024 * 1024
        });
        return { path: fs.readFileSync(outFile, "utf8").trim(), error: null };
    } catch (err) {
        // 带上 stderr 里最有用的那行，便于定位识别失败的原因
        const raw = err && err.stderr ? String(err.stderr) : String(err && err.message || err);
        const detail = raw.split("\n").map((line) => line.trim()).filter(Boolean).pop() || "";
        return { path: "", error: detail };
    } finally {
        fs.unlink(outFile, () => {});
    }
}

module.exports = {
    getFirstPagePath
};
