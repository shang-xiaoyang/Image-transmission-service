const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 根据用户名将照片分类存储
    const userName = req.body.userName || 'unknown';
    const userDir = path.join(uploadDir, userName);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    // 生成精确到毫秒的时间戳文件名
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(2, '0');
    
    const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}${ext}`);
  }
});

const upload = multer({ storage });

// 处理文件上传请求
app.post('/upload', upload.single('file'), (req, res) => {
  console.log('收到上传请求：');
  console.log('用户名称：', req.body.userName);
  console.log('上传文件：', req.file ? req.file.filename : '无文件');
  
  if (req.file) {
    res.json({
      success: true,
      message: '上传成功',
      data: {
        fileName: req.file.filename,
        userName: req.body.userName,
        filePath: req.file.path
      }
    });
  } else {
    res.json({
      success: false,
      message: '上传失败，无文件'
    });
  }
});

// 测试路由
app.get('/', (req, res) => {
  res.json({
    message: '服务器运行正常',
    uploadEndpoint: '/upload',
    uploadDir: uploadDir
  });
});

// 启动服务器
const port = 3000;
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`上传目录：${uploadDir}`);
  console.log(`测试地址：http://localhost:${port}/`);
});