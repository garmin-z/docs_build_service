// 部署任务运行状态：WebSocket 新连接（比如刷新页面）需要同步当前状态，
// 否则页面上不会显示“任务执行中”的加载图标
let running = false;

module.exports = {
    isRunning() {
        return running;
    },
    setRunning(value) {
        running = Boolean(value);
    }
};
