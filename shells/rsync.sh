#!/bin/bash
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

# 参数校验：只允许小写字母、数字、下划线，避免拼出错误的远程路径
if ! [[ "$params1" =~ ^[a-z0-9_]+$ ]]; then
    log "非法参数： 【$params1】"
    exit 1
fi

# 定义本地目录路径，需要根据实际情况修改
local_directory="${DOCS_ROOT:-/app/ufactory_docs}/$params1/.vitepress/dist/"

# 定义服务器的地址、用户名和目标目录路径（页面配置优先，脚本默认值兜底）
server_address="${DOCS_PUBLISH_HOST:-3.138.33.79}"
server_username="${DOCS_PUBLISH_USER:-ec2-user}"
server_target_directory="${DOCS_PUBLISH_DIR:-/home/ec2-user/ufactory_docs}/$params1"

if [ ! -d "$local_directory" ]; then
    log "本地构建目录不存在：$local_directory，请先执行打包"
    exit 1
fi

log "准备开始发布到服务器 $server_address:$server_target_directory"

# 确保远程目标目录存在；不再先整体清空目录，避免上传失败时站点变成空的
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$server_username@$server_address" \
    "mkdir -p '$server_target_directory'"; then
    log "连接服务器或创建目标目录失败，请检查网络和密钥配置"
    exit 1
fi

# 使用 rsync --delete 同步：增量上传并删除远端多余文件，无需事先清空目录
if rsync -avz --delete --progress -e "ssh -o BatchMode=yes -o ConnectTimeout=10" \
    "$local_directory" "$server_username@$server_address:$server_target_directory/"; then
    log "上传服务器成功"
else
    log "上传服务器失败，请检查相关设置和网络连接等情况"
    exit 1
fi
