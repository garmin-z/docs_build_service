#!/bin/bash
set -o pipefail
params1=$1

# 日志目录：/app/logs 不存在或不可写时退回到临时目录，避免因日志问题中断部署
LOG_DIR="${DOCS_LOG_DIR:-/app/logs}"
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
DEPLOY_PATH="${DOCS_ROOT:-/app/ufactory_docs}/$params1"
# 预览端口
PORT="${DOCS_PREVIEW_PORT:-3040}"

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

# 启动预览服务（后台常驻），输出单独记到预览日志便于排查。
# 注意：不能给 npm run docs:dev 追加 --port，仓库脚本里已有 --port 时会变成
# "vitepress dev --port 3040 --port 3040"，vitepress 会因端口参数重复直接崩溃。
# 所以优先直接调用仓库本地的 vitepress 可执行文件，端口完全由配置决定。
PREVIEW_LOG="$LOG_DIR/preview_${PORT}_$(date +'%Y_%m_%d').log"
log "启动预览（日志：$PREVIEW_LOG）..."
if [ -x "./node_modules/.bin/vitepress" ]; then
    PREVIEW_CMD=(./node_modules/.bin/vitepress dev --host --port "$PORT")
else
    # 兜底：仓库没有本地 vitepress 时使用仓库自己的脚本（端口以仓库配置为准）
    PREVIEW_CMD=(npm run docs:dev)
fi

if command -v setsid > /dev/null 2>&1; then
    setsid "${PREVIEW_CMD[@]}" &>> "$PREVIEW_LOG" < /dev/null &
else
    nohup "${PREVIEW_CMD[@]}" &>> "$PREVIEW_LOG" < /dev/null &
fi
DEV_PID=$!

# 等待端口就绪（最多 60 秒）；进程提前退出时立即报错
pid=""
for _ in $(seq 1 60); do
    pid=$(lsof -t -i:$PORT 2>/dev/null | head -n 1)
    if [ -n "$pid" ]; then
        break
    fi
    if ! kill -0 "$DEV_PID" 2>/dev/null; then
        break
    fi
    sleep 1
done

if [ -n "$pid" ]; then
    log "预览已启动，端口 $PORT（PID $pid）"
else
    log "预览启动失败（进程退出或端口 $PORT 未监听），最近日志如下："
    tail -n 30 "$PREVIEW_LOG" 2>/dev/null | while IFS= read -r line; do
        log "  $line"
    done
    exit 1
fi
