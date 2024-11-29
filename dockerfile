# 使用Node.js官方镜像作为基础镜像，选择合适的版本，这里以18为例
FROM node:18

# 设置工作目录
WORKDIR /app

# 复制项目的package.json和package-lock.json文件到工作目录
COPY package*.json ./

# 安装项目依赖，包括puppeteer等
# RUN npm install

# 复制项目的所有源代码到工作目录
COPY . .

# 暴露服务器监听的端口
EXPOSE 3020
EXPOSE 3030

# 定义容器启动时要执行的命令，启动Express服务器 & npm run export:api & npm run webhooks
CMD ["./start.sh"]
