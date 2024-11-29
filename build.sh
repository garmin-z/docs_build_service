#!/bin/bash

# 日志文件路径
# LOG_DIR="/var/log/ufactory_docs"
LOG_DIR="/var/log"
# LOG_DIR="app/log/ufactory_docs"


# LOG_FILE="$LOG_DIR/deploy_$(date +'%Y_%m_%d').log"
LOG_FILE="$LOG_DIR/docs.log"


# 创建日志目录
mkdir -p "$LOG_DIR" || { echo "无法创建日志目录 $LOG_DIR"; exit 1; }

log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# 项目部署路径
DEPLOY_PATH="/app/ufactory_docs"
# DEPLOY_PATH="app/ufactory_docs"

log "开始部署脚本"

# 1. 创建部署路径
if [ ! -d "$DEPLOY_PATH" ]; then
    mkdir -p "$DEPLOY_PATH"
    log "创建项目目录 $DEPLOY_PATH"
else
    log "项目目录已存在，跳过创建"
fi

# 2. 设置用户和用户组 (可选)
# USER="your_user"
# GROUP="your_group"
# chown -R $USER:$GROUP "$DEPLOY_PATH"
# log "设置用户和用户组 $USER:$GROUP"

# 3. 拉取代码
# 检查本地是否已经拉取过代码（即是否存在.git目录）
log "开始拉取代码..."
if [ ! -d "$DEPLOY_PATH/.git" ]; then
    git clone https://github.com/garmin-z/vitepress_docs.git "$DEPLOY_PATH" &>> "$LOG_FILE" && log "代码拉取完成"
else
    # 进入到已存在的git项目目录
    cd "$DEPLOY_PATH"
    
    # 获取本地仓库当前的HEAD提交哈希值
    local_head=$(git rev-parse HEAD)
    
    # 获取远程仓库的HEAD提交哈希值
    remote_head=$(git ls-remote origin HEAD | awk '{print $1}')
    
    # 比较本地和远程的HEAD提交哈希值，判断是否有新变动
    if [ "$local_head" != "$remote_head" ]; then
        git pull && log "检测到新变动，代码拉取更新完成"
    else
        log "代码无新变动，跳过拉取"
        exit 0
    fi
    
    # 返回之前的工作目录（如果需要的话），假设之前的工作目录是上级目录
    cd -
fi

# 4. 切换到项目目录
cd "$DEPLOY_PATH" &>> "$LOG_FILE" || exit
log "切换到项目目录 $DEPLOY_PATH"

# 5. 安装依赖
log "安装依赖..."
npm install &>> "$LOG_FILE" && log "依赖安装完成"

# 6. 构建项目
log "构建项目..."
npm run docs:build &>> "$LOG_FILE" && log "项目构建完成"

log "脚本执行结束"


# 打包PDF文件
# log_with_time "Packaging PDF..."
# npm run export:cn && npm run export:en
# if [ $? -ne 0 ]; then
#     log_with_time "PDF packaging failed. Exiting..."
#     exit 1
# fi

# 部署完成
# log_with_time "Deployment complete."

# 创建一个.sh脚本有这些功能（要有日志记录，每天日志需要有时间）：
#  1. 设置项目部署路径/app/ufactory_docs(如果存在就跳过)
#  2. 设置用户和用户组（目前未用到，可以根据需要调整文件权限）(如果存在就跳过)
#  3. 从https://github.com/garmin-z/smg.git拉取代码到项目ufactory_docs
#  4. 切换到项目目录ufactory_docs
#  5. npm install 安装依赖
#  6. npm run docs:build 构建项目
#  7. 结束脚本
# 注意：整体逻辑是前端，有个按钮和一个日志显示， 通过按钮发送请求到后端express, 然后执行.sh该脚本，能够获取执行的信息和执行的状态， 通过websocket发送给前端,在前端显示执行状态和日志
# 请实现前端和后端所有代码