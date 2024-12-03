#!/bin/bash

# 定义本地目录路径，需要根据实际情况修改
local_directory="/app/ufactory_docs/.vitepress/dist/"

# 定义服务器的地址、用户名和目标目录路径，需要根据实际情况修改
server_address="3.138.33.79"
server_username="ec2-user"
server_target_directory="/home/ec2-user/ufactory_docs"

# 使用rsync进行上传
rsync -avz --progress $local_directory $server_username@$server_address:$server_target_directory

# 检查rsync的返回值，以确定上传是否成功
if [ $? -eq 0 ]; then
    echo "上传服务器成功"
else
    echo "上传服务器失败，请检查相关设置和网络连接等情况"
fi