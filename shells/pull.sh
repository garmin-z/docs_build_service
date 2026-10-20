#!/bin/bash
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

log "目标分支： 【$params1】"

# 项目部署路径
DEPLOY_PATH="/app/ufactory_docs/$params1"

log "开始部署脚本"

# 1. 创建部署路径
if [ ! -d "$DEPLOY_PATH" ]; then
    mkdir -p "$DEPLOY_PATH" || { log "无法创建目录 $DEPLOY_PATH，请检查目录权限"; exit 1; }
    log "创建项目目录 $DEPLOY_PATH"
else
    log "项目目录已存在，跳过创建"
fi

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
    DOCS_URL="https://github.com/xArm-Developer/ufactory_docs.git"
    echo DOCS_URL: $DOCS_URL
    # 克隆指定分支
    git clone -b "$branch_name" "$DOCS_URL" "$DEPLOY_PATH" &>> "$LOG_FILE" && log "代码拉取完成"

else
    # 进入到已存在的git项目目录
    cd "$DEPLOY_PATH" || { log "无法进入目录 $DEPLOY_PATH"; exit 1; }

    # 忽略文件权限变化（必须在仓库目录内执行才生效）
    git config core.filemode false

    # 先切换到目标分支，保证后续比较和更新的是同一个分支
    if ! git checkout "$branch_name" &>> "$LOG_FILE"; then
        log "切换到分支 $branch_name 失败，请查看日志 $LOG_FILE"
        exit 1
    fi

    # 只拉取目标分支的远程信息
    log "检查分支 $branch_name 是否有更新..."
    if ! git fetch origin "$branch_name" &>> "$LOG_FILE"; then
        log "拉取远程分支 $branch_name 失败，请检查网络或代理"
        exit 1
    fi

    # 比较目标分支的本地提交与远端提交（原逻辑比较的是远端默认分支 HEAD）
    local_head=$(git rev-parse HEAD)
    remote_head=$(git rev-parse --verify --quiet "refs/remotes/origin/$branch_name")

    if [ -z "$remote_head" ]; then
        log "远端仓库不存在分支 $branch_name"
        exit 1
    fi

    if [ "$local_head" != "$remote_head" ]; then
        # 快进到远端最新提交；无法快进（历史分叉）时报错而不是静默合并
        log "检测到新变动，开始更新分支 $branch_name..."
        if git merge --ff-only "origin/$branch_name" &>> "$LOG_FILE"; then
            log "代码拉取更新完成"
        else
            log "代码更新失败，请查看日志 $LOG_FILE"
            exit 1
        fi
    else
        log "代码无新变动，跳过拉取"
        exit 0
    fi
fi
