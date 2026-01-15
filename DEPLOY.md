# 抖音云部署指南

## 1. 项目结构
```
Image-transmission-service/
├── Dockerfile          # Docker配置文件
├── package.json        # 项目依赖和脚本
├── package-lock.json   # 依赖锁定文件
├── server.js           # 服务端主程序
└── DEPLOY.md           # 部署指南
```

## 2. 服务端配置

### 2.1 主要功能
- 接收小程序上传的照片
- 按用户名称分类存储照片
- 提供照片上传的API接口

### 2.2 关键配置

#### 上传目录
```javascript
const uploadDir = path.join(__dirname, 'uploads');
```

#### 文件名格式
```javascript
// 格式：YYYYMMDDHHmmssSSS.ext
// 示例：20260115102030123.png
```

## 3. 抖音云部署步骤

### 3.1 准备工作
1. 注册并登录抖音云控制台
2. 创建云应用实例
3. 配置域名和SSL证书
4. 准备Docker镜像

### 3.2 构建Docker镜像
```bash
# 进入项目目录
cd Image-transmission-service

# 构建Docker镜像
docker build -t image-transmission-service .
```

### 3.3 推送镜像到抖音云容器仓库
```bash
# 登录抖音云容器仓库
docker login ccr.tiktok-cloud.com

# 标签镜像
docker tag image-transmission-service ccr.tiktok-cloud.com/your-namespace/image-transmission-service

# 推送镜像
docker push ccr.tiktok-cloud.com/your-namespace/image-transmission-service
```

### 3.4 部署到抖音云
1. 在抖音云控制台创建应用
2. 选择容器镜像部署
3. 选择刚才推送的镜像
4. 配置环境变量（如果需要）
5. 配置端口映射（3000端口）
6. 配置存储卷（可选，用于持久化存储上传的照片）
7. 启动应用

## 4. 小程序配置

### 4.1 更新上传地址
修改 `config.js` 文件中的 `production.uploadUrl` 为抖音云提供的域名：

```javascript
// 生产环境 - 抖音云服务器
production: {
  uploadUrl: 'https://your-tiktok-cloud-domain.com/upload'
}
```

### 4.2 域名配置
在抖音小程序管理后台配置服务器域名：
1. 登录抖音开放平台
2. 进入小程序管理后台
3. 找到「开发设置」
4. 添加域名到「request合法域名」和「uploadFile合法域名」

## 5. 测试

### 5.1 服务端测试
```bash
# 测试服务器是否正常运行
curl https://your-tiktok-cloud-domain.com/

# 预期返回：{"message":"服务器运行正常","uploadEndpoint":"/upload"}
```

### 5.2 小程序测试
1. 在真机上打开小程序
2. 选择照片并上传
3. 检查服务端是否收到照片
4. 检查上传目录是否有照片文件

## 6. 管理照片

### 6.1 查看上传的照片
照片存储在服务端的 `uploads` 目录下，按用户名称分类：
```
uploads/
├── 用户1/
│   └── 20260115102030123.png
└── 用户2/
    └── 20260115102145678.jpg
```

### 6.2 抖音云存储
如果配置了存储卷，照片会持久化存储在抖音云的存储服务中。

## 7. 常见问题

### 7.1 上传失败
- 检查域名是否正确配置
- 检查SSL证书是否有效
- 检查服务端是否正常运行

### 7.2 照片无法查看
- 检查上传目录权限
- 检查服务端日志
- 检查网络连接

### 7.3 部署失败
- 检查Dockerfile是否正确
- 检查端口是否冲突
- 检查环境变量配置

## 8. 联系方式

如有任何问题，请随时联系技术支持。
