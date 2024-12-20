#!/bin/bash
params1=$1

# 日志文件路径
LOG_DIR="/app/logs"
LOG_FILE="$LOG_DIR/deploy_$(date +'%Y_%m_%d').log"

# 创建日志目录
mkdir -p "$LOG_DIR" || { echo "无法创建日志目录 $LOG_DIR"; exit 1; }

log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# 项目部署路径
DEPLOY_PATH="/app/ufactory_doc_$params1"

# 切换到项目目录
cd "$DEPLOY_PATH" || { log "无法进入目录 $DEPLOY_PATH"; exit 1; }
log "切换到项目目录 $DEPLOY_PATH"

# 安装依赖
log "安装依赖..."
npm install && log "安装依赖完成"

# 构建项目
log "构建项目..."
npm run docs:dev && log "打开项目预览" || { log "打开项目预览失败"; exit 1; }


log "预览端口为: 3040"
