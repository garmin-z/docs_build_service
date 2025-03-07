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


log "目标分支： 【$params1】"

# 项目部署路径
DEPLOY_PATH="/app/ufactory_docs/$params1"

log "开始部署脚本"

# 1. 创建部署路径
if [ ! -d "$DEPLOY_PATH" ]; then
    mkdir -p "$DEPLOY_PATH"
    log "创建项目目录 $DEPLOY_PATH"
else
    log "项目目录已存在，跳过创建"
fi

# 忽略文件权限变化
git config core.filemode false

log "设置代理"
export http_proxy=http://192.168.1.176:8016
export https_proxy=http://192.168.1.176:8016

# 分支名称
branch_name="ufactory_doc_$params1"

# 2. 拉取代码
# 检查本地是否已经拉取过代码（即是否存在.git目录）
log "开始拉取代码..."
if [ ! -d "$DEPLOY_PATH/.git" ]; then
    # DOCS_URL=https://github.com/xArm-Developer/ufactory_doc_$params1.git
    DOCS_URL="https://github.com/xArm-Developer/ufactory_doc_usermanual.git"
    echo DOCS_URL: $DOCS_URL
    # git clone https://github.com/garmin-z/vitepress_docs.git "$DEPLOY_PATH" &>> "$LOG_FILE" && log "代码拉取完成"
    # git clone $DOCS_URL "$DEPLOY_PATH" &>> "$LOG_FILE" && log "代码拉取完成"
    # 克隆指定分支
    git clone -b $branch_name $DOCS_URL "$DEPLOY_PATH" &>> "$LOG_FILE" && log "代码拉取完成"
    
else
    # 进入到已存在的git项目目录
    cd "$DEPLOY_PATH"
    
    # 获取本地仓库当前的HEAD提交哈希值
    local_head=$(git rev-parse HEAD)
    
    # 获取远程仓库的HEAD提交哈希值
    remote_head=$(git ls-remote origin HEAD | awk '{print $1}')
    
    # 比较本地和远程的HEAD提交哈希值，判断是否有新变动
    if [ "$local_head" != "$remote_head" ]; then
        # 切换到指定分支并拉取最新代码
        git checkout $branch_name && git pull && log "检测到新变动，代码拉取更新完成"
    else
        log "代码无新变动，跳过拉取"
        exit 0
    fi
    
    # 返回之前的工作目录（如果需要的话），假设之前的工作目录是上级目录
    cd -
fi