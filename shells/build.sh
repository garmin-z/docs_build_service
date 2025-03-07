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
DEPLOY_PATH="/app/ufactory_docs/$params1"

# 切换到项目目录
cd "$DEPLOY_PATH" || { log "无法进入目录 $DEPLOY_PATH"; exit 1; }
log "切换到项目目录 $DEPLOY_PATH"

# 安装依赖
log "安装依赖..."
npm install && log "安装依赖完成"

# 构建项目
log "构建项目..."
npm run docs:build && log "项目构建完成" || { log "构建项目失败"; exit 1; }

# 生成PDF
# log "生成PDF..."
# npm run export:cn && log "中文PDF生成完成" || { log "中文PDF生成失败"; exit 1; }
# npm run export:en && log "英文PDF生成完成" || { log "英文PDF生成失败"; exit 1; }

log "打包完成..."
