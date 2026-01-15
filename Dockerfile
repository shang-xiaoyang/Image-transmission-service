# 基础镜像：Linux系统专用 Node.js20 轻量版，Alpine是Linux发行版，体积小、运行稳定，生产环境最优

FROM node:20-alpine3.19

# ============ Linux系统必备配置 - 解决你的照片上传/下载核心问题 ============

# 1. 安装Linux依赖+设置中国时区，避免文件时间戳错误、上传权限错误

RUN apk add --no-cache tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

# 2. 创建照片上传目录+赋权（你的核心业务：用户传照片、打印照片，必加！解决Linux权限不足）

# 目录路径和你代码里的一致，无需改代码

RUN mkdir -p /app/uploads && chmod -R 777 /app/uploads

# 设置容器内工作目录

WORKDIR /app

# 复制项目目录下的依赖文件，优先下载依赖（Docker缓存优化，构建更快）

COPY Image-transmission-service/package*.json ./

# Linux环境下安装生产依赖，用国内源，下载速度拉满，无冗余包

RUN npm install --registry=https://registry.npmmirror.com --production

# 复制你的所有项目代码到容器内

COPY Image-transmission-service/ ./

# ============ 关键配置 - 必须核对修改！！ ============

# 暴露你的服务端口：改成你 server.js 里 app.listen(端口号) 的真实端口，比如3000/8080/80

EXPOSE 3000

# 启动你的服务：入口文件是 server.js 就写server.js，是app.js就改app.js，和你项目一致

CMD ["node", "server.js"]
