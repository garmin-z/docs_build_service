#!/bin/bash

# 先安装项目依赖（这里假设已经在Dockerfile中通过RUN npm install复制了package*.json文件后进行过一次安装，
# 但如果项目源代码复制进去后有新的依赖变化等情况，这里可以再次确保依赖安装完整）
npm install

# 启动Express服务器及相关操作（这里假设你的启动相关操作在package.json的scripts字段下定义为start）
npm run start