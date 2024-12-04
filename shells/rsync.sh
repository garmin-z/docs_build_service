#!/bin/bash

# 日志文件路径
LOG_DIR="/app/logs"
LOG_FILE="$LOG_DIR/deploy_$(date +'%Y_%m_%d').log"

# 创建日志目录
mkdir -p "$LOG_DIR" || { echo "无法创建日志目录 $LOG_DIR"; exit 1; }

log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}


# 定义本地目录路径，需要根据实际情况修改
local_directory="/app/ufactory_docs/.vitepress/dist/"
# local_directory="/mnt/d/code/ufactory_docs/.vitepress/dist/"

# 定义服务器的地址、用户名和目标目录路径，需要根据实际情况修改
server_address="3.138.33.79"
server_username="ec2-user"
server_target_directory="/home/ec2-user/ufactory_docs"
log "准备开始发布到服务器"

# 使用rsync进行上传
rsync -avz --progress $local_directory $server_username@$server_address:$server_target_directory && log "上传"

# 检查rsync的返回值，以确定上传是否成功
if [ $? -eq 0 ]; then
    log "上传服务器成功"
else
    log "上传服务器失败，请检查相关设置和网络连接等情况"
fi