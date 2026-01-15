# 基础镜像：Linux系统专用 Node.js20 轻量版，适配抖音云，体积小、运行稳定、构建快
FROM node:20-alpine3.19

# ============ Linux系统必配 核心配置 (照片上传业务刚需) ============
# 1. 安装时区依赖+设置中国上海时区，解决照片上传时间戳错误、日志时间不对问题
RUN apk add --no-cache tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

# 2. 创建照片上传目录+赋777最高读写权限，彻底解决Linux下照片上传权限不足/目录不存在报错
RUN mkdir -p /app/uploads && chmod -R 777 /app/uploads

# 设置容器内的工作目录
WORKDIR /app

# ============ 复制项目文件 (核心修正：适配你的根目录结构，无任何子文件夹) ============
# 优先复制依赖文件，利用Docker缓存，后续代码修改不用重新下载依赖，构建更快
COPY package*.json ./

# 安装生产环境依赖，使用国内淘宝源加速，解决下载慢/超时问题，适配Linux系统
RUN npm install --registry=https://registry.npmmirror.com --production

# 复制当前目录下所有项目文件到容器内 (你的目录结构完美匹配这个命令，绝对不会找不到文件)
COPY . ./

# ============ 抖音云容器配置 ============
# 创建抖音云要求的启动脚本目录
RUN mkdir -p /opt/application

# 复制启动脚本到抖音云指定位置
COPY run.sh /opt/application/

# 设置启动脚本执行权限
RUN chmod +x /opt/application/run.sh

# 暴露你的服务端口：3000 （你项目里用的就是这个端口，正确）
EXPOSE 3000

# 抖音云启动命令：执行指定位置的启动脚本
CMD ["/opt/application/run.sh"]
