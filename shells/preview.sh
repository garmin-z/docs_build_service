#!/bin/bash
set -o pipefail
params1=$1

# 日志目录：/app/logs 不存在或不可写时退回到临时目录，避免因日志问题中断部署
LOG_DIR="/app/logs"
if ! { mkdir -p "$LOG_DIR" && touch "$LOG_DIR/.write_test"; } 2>/dev/null; then
    LOG_DIR="${TMPDIR:-/tmp}/docs_build_logs"
    mkdir -p "$LOG_DIR" || { echo "无法创建日志目录 $LOG_DIR"; exit 1; }
    echo "警告：/app/logs 不可写，日志改存到 $LOG_DIR"
else
    rm -f "$LOG_DIR/.write_test"
fi
LOG_FILE="$LOG_DIR/deploy_$(date +'%Y_%m_%d').log"

log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# 参数校验：只允许小写字母、数字、下划线
if ! [[ "$params1" =~ ^[a-z0-9_]+$ ]]; then
    log "非法参数： 【$params1】"
    exit 1
fi

# 项目部署路径
DEPLOY_PATH="/app/ufactory_docs/$params1"

# 切换到项目目录
cd "$DEPLOY_PATH" || { log "无法进入目录 $DEPLOY_PATH"; exit 1; }
log "切换到项目目录 $DEPLOY_PATH"

# 安装依赖
log "安装依赖..."
if ! npm install 2>&1 | tee -a "$LOG_FILE"; then
    log "安装依赖失败，请查看日志 $LOG_FILE"
    exit 1
fi
log "安装依赖完成"

# 启动预览服务（后台常驻，输出写入日志文件），脚本本身不再一直挂起
log "启动预览..."
nohup npm run docs:dev &>> "$LOG_FILE" < /dev/null &

# 等待端口就绪（最多 15 秒）
for _ in $(seq 1 15); do
    if lsof -t -i:3040 > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

pid=$(lsof -t -i:3040 2>/dev/null | head -n 1)
if [ -n "$pid" ]; then
    log "预览已启动，端口 3040（PID $pid）"
else
    log "预览启动失败或端口不是 3040，请查看日志 $LOG_FILE"
    exit 1
fi
