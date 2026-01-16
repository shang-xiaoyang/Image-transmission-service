const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const archiver = require('archiver');
const { TosClient } = require('@volcengine/tos-sdk');

// 创建日志目录
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 自定义日志工具
class Logger {
  constructor() {
    this.logDir = logDir;
  }
  
  // 获取当前日志文件名（按日期）
  getCurrentLogFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}.log`;
  }
  
  // 获取当前日志文件路径
  getCurrentLogFilePath() {
    return path.join(this.logDir, this.getCurrentLogFileName());
  }
  
  // 记录日志
  log(...messages) {
    const timestamp = new Date().toISOString();
    
    // 将所有消息转换为字符串，特别是对象类型
    const stringMessages = messages.map(msg => {
      if (typeof msg === 'object' && msg !== null) {
        try {
          return JSON.stringify(msg);
        } catch (e) {
          return String(msg);
        }
      }
      return String(msg);
    });
    
    const logMessage = `${timestamp} - ${stringMessages.join(' ')}\n`;
    
    // 输出到控制台（保持原始格式便于查看）
    console.log(...messages);
    
    // 写入文件（使用JSON字符串格式）
    const logFilePath = this.getCurrentLogFilePath();
    try {
      fs.appendFileSync(logFilePath, logMessage, 'utf8');
    } catch (error) {
      logger.error('写入日志文件失败:', error);
    }
  }
  
  // 记录信息级日志
  info(...messages) {
    this.log('[INFO]', ...messages);
  }
  
  // 记录错误级日志
  error(...messages) {
    this.log('[ERROR]', ...messages);
  }
  
  // 记录警告级日志
  warn(...messages) {
    this.log('[WARN]', ...messages);
  }
  
  // 记录调试级日志
  debug(...messages) {
    this.log('[DEBUG]', ...messages);
  }
}

// 创建日志实例
const logger = new Logger();

// 设置archiver的并发限制
archiver.defaults = {
  zlib: { level: 9 }
};

// 配置TOS客户端（在抖音云环境中从环境变量获取凭证）
let tosClient = null;
let enableTOS = false;

try {
  // 尝试从环境变量获取TOS凭证
  const accessKeyId = process.env.TOS_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID;
  const accessKeySecret = process.env.TOS_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY;
  
  if (accessKeyId && accessKeySecret) {
    tosClient = new TosClient({
      region: 'cn-beijing', // 根据域名中的tos-beijing判断地区
      endpoint: 'https://tt10d96664eba8f7901-env-ot20zyxfia.tos-beijing.volces.com', // 对象存储域名
      accessKeyId: accessKeyId,
      accessKeySecret: accessKeySecret,
    });
    enableTOS = true;
    logger.info('TOS客户端初始化成功');
  } else {
    logger.info('未配置TOS凭证，将使用本地存储');
  }
} catch (error) {
  logger.error('TOS客户端初始化失败:', error);
}

// 桶名称
const bucketName = 'tt10d96664eba8f7901-env-ot20zyxfia'; // 桶名称

// 管理员用户数据文件路径
const adminUsersPath = path.join(__dirname, 'adminUsers.json');

// 确保管理员用户文件存在
if (!fs.existsSync(adminUsersPath)) {
  // 创建默认管理员用户（密码：admin123）
  const defaultAdmin = {
    username: 'admin',
    password: bcrypt.hashSync('admin123', 10),
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(adminUsersPath, JSON.stringify([defaultAdmin], null, 2));
}

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// 为JSON和URL编码的请求设置更大的限制
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 配置会话管理
app.use(session({
  secret: 'photo-upload-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24小时
    secure: false, // 在生产环境中应设置为true（仅HTTPS）
    httpOnly: true
  }
}));

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 根据用户名将照片分类存储，防止路径遍历攻击
    const rawUserName = req.body.userName || 'unknown';
    // 过滤用户名中的危险字符
    const userName = rawUserName.replace(/[\/\\:*?"<>|]/g, '').substring(0, 50);
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

// 配置multer上传限制
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制文件大小为5MB
    fieldSize: 5 * 1024 * 1024 // 限制表单字段大小为5MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许上传图片文件
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传JPEG、PNG、GIF、WEBP格式的图片文件'), false);
    }
  }
});

// 添加请求日志中间件（记录请求开始时间和完整信息）
app.use((req, res, next) => {
  // 记录请求开始时间
  req.startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  logger.info('=== 请求开始 ===');
  logger.info(`${timestamp} - ${req.method} ${req.path} from ${req.ip}`);
  logger.info('请求头：', req.headers);
  logger.info('请求查询参数：', req.query);
  
  // 记录请求结束信息
  const originalSend = res.send;
  res.send = function(data) {
    // 计算请求处理时间
    const processTime = Date.now() - req.startTime;
    
    logger.info('=== 请求结束 ===');
    logger.info(`${req.method} ${req.path} 响应状态：${res.statusCode}`);
    logger.info(`请求处理时间：${processTime}ms`);
    
    // 记录响应内容（仅记录关键信息，避免日志过大）
    if (typeof data === 'string') {
      try {
        const responseObj = JSON.parse(data);
        logger.info('响应内容：', {
          success: responseObj.success,
          message: responseObj.message,
          hasData: !!responseObj.data
        });
      } catch (e) {
        // 如果不是JSON，只记录响应长度
        logger.info(`响应内容长度：${data.length}字符`);
      }
    } else if (typeof data === 'object') {
      logger.info('响应内容：', {
        success: data.success,
        message: data.message,
        hasData: !!data.data
      });
    }
    
    // 调用原始的send方法
    return originalSend.apply(res, arguments);
  };
  
  next();
});

// 处理multer上传错误和其他错误
app.use((err, req, res, next) => {
  // 记录错误发生的时间和请求信息
  const timestamp = new Date().toISOString();
  logger.error('=== 错误发生 ===');
  logger.error(`${timestamp} - ${req.method} ${req.path} 错误类型：${err.code || 'unknown'}`);
  logger.error('错误信息：', err.message);
  logger.error('错误堆栈：', err.stack);
  
  // 记录请求上下文
  if (req.body) {
    logger.error('请求表单数据：', req.body);
  }
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    logger.error('文件大小超过限制:', {
      limit: '5MB',
      receivedType: req.file ? req.file.mimetype : 'unknown'
    });
    return res.status(400).json({
      success: false,
      message: '文件大小超过限制，最大支持5MB'
    });
  } else if (err.code === 'LIMIT_FIELD_SIZE') {
    logger.error('表单字段大小超过限制:', {
      limit: '5MB',
      fieldName: err.field || 'unknown'
    });
    return res.status(400).json({
      success: false,
      message: '表单字段大小超过限制'
    });
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    logger.error('文件数量超过限制:', {
      limit: 1, // 当前只支持单文件上传
      receivedCount: err.count || 0
    });
    return res.status(400).json({
      success: false,
      message: '文件数量超过限制'
    });
  } else if (err.message.includes('只允许上传')) {
    logger.error('文件类型不允许:', {
      receivedType: req.file ? req.file.mimetype : 'unknown',
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    });
    return res.status(400).json({
      success: false,
      message: err.message
    });
  } else if (err.code === 'ENOENT') {
    logger.error('文件或目录不存在:', err.path);
    return res.status(404).json({
      success: false,
      message: '文件或目录不存在'
    });
  } else if (err.code === 'EACCES') {
    logger.error('权限不足:', err.path);
    return res.status(500).json({
      success: false,
      message: '服务器权限不足'
    });
  }
  
  // 处理其他未捕获的错误
  logger.error('未处理的错误:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : '未处理的错误: ' + err.message
  });
});

// 处理文件上传请求
app.post('/upload', upload.single('file'), async (req, res) => {
  const timestamp = new Date().toISOString();
  logger.info('=== 收到上传请求 ===');
  logger.info(`${timestamp} - 客户端IP：`, req.ip);
  logger.info('请求方法：', req.method);
  logger.info('请求路径：', req.path);
  logger.info('请求头：', req.headers);
  logger.info('请求内容类型：', req.headers['content-type']);
  logger.info('请求查询参数：', req.query);
  logger.info('原始表单数据：', req.body);
  
  // 记录用户名信息
  const rawUserName = req.body.userName || 'unknown';
  const filteredUserName = rawUserName.replace(/[\/\\:*?"<>|]/g, '').substring(0, 50);
  logger.info('原始用户名：', rawUserName);
  logger.info('过滤后的用户名：', filteredUserName);
  
  logger.info('上传文件：', req.file ? req.file.filename : '无文件');
  if (req.file) {
    logger.info('文件详情：', {
      originalname: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: (req.file.size / 1024).toFixed(2) + 'KB',
      path: req.file.path
    });
  } else {
    logger.info('文件详情：', null);
  }
  logger.info('是否有文件：', req.file ? '是' : '否');
  logger.info('是否启用TOS：', enableTOS ? '是' : '否');
  
  // 响应所有请求，无论是否有文件
  if (req.file) {
    try {
      // 过滤用户名中的危险字符，防止路径遍历攻击
      const rawUserName = req.body.userName || 'unknown';
      const userName = rawUserName.replace(/[\/\\:*?"<>|]/g, '').substring(0, 50);
      
      // 如果启用了TOS，上传到对象存储
      if (enableTOS && tosClient) {
        // 构建TOS对象键
        const objectKey = `${userName}/${req.file.filename}`;
        
        logger.info('开始上传到TOS', { bucketName, objectKey });
        
        // 上传文件到TOS
        const uploadResult = await tosClient.putObject({
          bucket: bucketName,
          key: objectKey,
          body: fs.createReadStream(req.file.path),
          contentType: req.file.mimetype
        });
        
        logger.info('TOS上传成功', uploadResult);
        
        // 构建对象存储URL
        const objectUrl = `${tosClient.config.endpoint}/${bucketName}/${objectKey}`;
        
        // 删除本地临时文件
        fs.unlinkSync(req.file.path);
        logger.info('删除本地临时文件成功', req.file.path);
        
        logger.info('TOS上传成功，响应客户端');
        res.json({
          success: true,
          message: '上传成功',
          data: {
            fileName: req.file.filename,
            userName: userName,
            objectKey: objectKey,
            objectUrl: objectUrl,
            bucketName: bucketName,
            storageType: 'tos',
            fileSize: (req.file.size / 1024).toFixed(2) + 'KB',
            fileType: req.file.mimetype
          }
        });
      } else {
        // 如果未启用TOS，使用本地存储
        logger.info('使用本地存储');
        
        logger.info('本地存储成功，响应客户端');
        res.json({
          success: true,
          message: '上传成功',
          data: {
            fileName: req.file.filename,
            userName: userName,
            filePath: req.file.path,
            storageType: 'local',
            fileSize: (req.file.size / 1024).toFixed(2) + 'KB',
            fileType: req.file.mimetype
          }
        });
      }
    } catch (error) {
      logger.error('上传失败:', {
        error: error,
        errorMessage: error.message,
        errorStack: error.stack,
        userName: userName,
        fileInfo: req.file ? {
          filename: req.file.filename,
          path: req.file.path,
          size: req.file.size
        } : null,
        storageType: enableTOS ? 'tos' : 'local'
      });
      
      // 删除本地临时文件
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
          logger.info('删除本地临时文件成功', req.file.path);
        } catch (unlinkError) {
          logger.error('删除本地临时文件失败:', unlinkError);
        }
      }
      
      res.json({
        success: false,
        message: enableTOS ? '上传到对象存储失败' : '本地存储失败',
        error: process.env.NODE_ENV === 'production' ? '上传失败，请稍后重试' : error.message
      });
    }
  } else {
    res.json({
      success: false,
      message: '上传失败，无文件'
    });
  }
});

// 辅助函数：读取所有管理员用户
function readAdminUsers() {
  try {
    const data = fs.readFileSync(adminUsersPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('读取管理员用户文件失败:', error);
    return [];
  }
}

// 辅助函数：保存管理员用户
function saveAdminUsers(users) {
  try {
    fs.writeFileSync(adminUsersPath, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    logger.error('保存管理员用户文件失败:', error);
    return false;
  }
}

// 辅助函数：查找用户
function findUser(username) {
  const users = readAdminUsers();
  return users.find(user => user.username === username);
}

// 辅助函数：更新用户密码
function updateUserPassword(username, newPassword) {
  const users = readAdminUsers();
  const userIndex = users.findIndex(user => user.username === username);
  
  if (userIndex === -1) {
    return false;
  }
  
  users[userIndex].password = bcrypt.hashSync(newPassword, 10);
  users[userIndex].updatedAt = new Date().toISOString();
  
  return saveAdminUsers(users);
}

// 全局错误处理中间件
app.use((err, req, res, next) => {
  logger.error('未处理的错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

// 登录页面
app.get('/login', (req, res) => {
  // 如果已经登录，跳转到管理界面
  if (req.session.isAuthenticated) {
    return res.redirect('/admin');
  }
  
  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理员登录</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
      }
      .login-container {
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        width: 300px;
      }
      h2 {
        text-align: center;
        color: #333;
        margin-bottom: 20px;
      }
      .input-group {
        margin-bottom: 15px;
      }
      label {
        display: block;
        margin-bottom: 5px;
        color: #555;
      }
      input {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
      }
      button {
        width: 100%;
        padding: 10px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      }
      button:hover {
        background-color: #45a049;
      }
      .error {
        color: red;
        text-align: center;
        margin-bottom: 15px;
      }
    </style>
  </head>
  <body>
    <div class="login-container">
      <h2>管理员登录</h2>
      ${req.query.error ? `<div class="error">${req.query.error}</div>` : ''}
      <form action="/login" method="POST">
        <div class="input-group">
          <label for="username">用户名</label>
          <input type="text" id="username" name="username" required>
        </div>
        <div class="input-group">
          <label for="password">密码</label>
          <input type="password" id="password" name="password" required>
        </div>
        <button type="submit">登录</button>
      </form>
    </div>
  </body>
  </html>
  `;
  
  res.send(html);
});

// 登录处理
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.redirect('/login?error=用户名和密码不能为空');
  }
  
  const user = findUser(username);
  
  if (!user) {
    return res.redirect('/login?error=用户名不存在');
  }
  
  // 验证密码
  if (!bcrypt.compareSync(password, user.password)) {
    return res.redirect('/login?error=密码错误');
  }
  
  // 设置会话
  req.session.isAuthenticated = true;
  req.session.username = username;
  
  res.redirect('/admin');
});

// 登出
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error('登出失败:', err);
    }
    res.redirect('/login');
  });
});

// 修改密码页面
app.get('/change-password', (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/login');
  }
  
  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>修改密码</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
      }
      .container {
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        width: 300px;
      }
      h2 {
        text-align: center;
        color: #333;
        margin-bottom: 20px;
      }
      .input-group {
        margin-bottom: 15px;
      }
      label {
        display: block;
        margin-bottom: 5px;
        color: #555;
      }
      input {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
      }
      button {
        width: 100%;
        padding: 10px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      }
      button:hover {
        background-color: #45a049;
      }
      .message {
        text-align: center;
        margin-bottom: 15px;
        padding: 10px;
        border-radius: 4px;
      }
      .success {
        background-color: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
      }
      .error {
        background-color: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
      }
      .back-link {
        display: block;
        text-align: center;
        margin-top: 15px;
        color: #007bff;
        text-decoration: none;
      }
      .back-link:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>修改密码</h2>
      ${req.query.success ? `<div class="message success">${req.query.success}</div>` : ''}
      ${req.query.error ? `<div class="message error">${req.query.error}</div>` : ''}
      <form action="/change-password" method="POST">
        <div class="input-group">
          <label for="currentPassword">当前密码</label>
          <input type="password" id="currentPassword" name="currentPassword" required>
        </div>
        <div class="input-group">
          <label for="newPassword">新密码</label>
          <input type="password" id="newPassword" name="newPassword" required>
        </div>
        <div class="input-group">
          <label for="confirmPassword">确认新密码</label>
          <input type="password" id="confirmPassword" name="confirmPassword" required>
        </div>
        <button type="submit">修改密码</button>
        <a href="/admin" class="back-link">返回管理界面</a>
      </form>
    </div>
  </body>
  </html>
  `;
  
  res.send(html);
});

// 修改密码处理
app.post('/change-password', (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/login');
  }
  
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const username = req.session.username;
  
  // 验证输入
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.redirect('/change-password?error=所有字段都不能为空');
  }
  
  if (newPassword !== confirmPassword) {
    return res.redirect('/change-password?error=两次输入的新密码不一致');
  }
  
  if (newPassword.length < 6) {
    return res.redirect('/change-password?error=新密码长度不能少于6个字符');
  }
  
  // 验证当前密码
  const user = findUser(username);
  if (!user) {
    return res.redirect('/change-password?error=用户不存在');
  }
  
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.redirect('/change-password?error=当前密码错误');
  }
  
  // 更新密码
  if (!updateUserPassword(username, newPassword)) {
    return res.redirect('/change-password?error=密码更新失败');
  }
  
  res.redirect('/change-password?success=密码修改成功');
});

// 静态文件服务 - 允许通过URL直接访问上传的照片
app.use('/uploads', express.static(uploadDir));

// 商户管理界面 - 简单的HTML页面用于查看和下载照片
app.get('/admin', (req, res) => {
  // 检查是否已登录
  if (!req.session.isAuthenticated) {
    return res.redirect('/login');
  }
  
  try {
    // 读取所有用户目录
    const users = fs.readdirSync(uploadDir).filter(item => {
      const itemPath = path.join(uploadDir, item);
      return fs.statSync(itemPath).isDirectory();
    });

    // 生成HTML页面
    let html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>照片管理系统</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; text-align: center; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
        .header-right { display: flex; gap: 10px; }
        .btn { background-color: #4CAF50; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 14px; }
        .btn:hover { background-color: #45a049; }
        .btn-danger { background-color: #f44336; }
        .btn-danger:hover { background-color: #da190b; }
        .btn-primary { background-color: #2196F3; }
        .btn-primary:hover { background-color: #0b7dda; }
        .user-section { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .user-title { font-size: 20px; color: #555; margin-bottom: 15px; }
        .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
        .photo-item { border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
        .photo-thumb { width: 100%; height: 150px; object-fit: cover; cursor: pointer; }
        .photo-info { padding: 10px; text-align: center; font-size: 14px; }
        .download-btn { background-color: #4CAF50; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 5px; }
        .download-btn:hover { background-color: #45a049; }
        .download-all { background-color: #2196F3; color: white; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin: 10px 0; font-size: 16px; }
        .download-all:hover { background-color: #0b7dda; }
        .login-info { font-size: 14px; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>照片管理系统</h1>
        <div class="header-right">
          <span class="login-info">欢迎，${req.session.username}</span>
          <a href="/change-password" class="btn btn-primary">修改密码</a>
          <a href="/logout" class="btn btn-danger">登出</a>
        </div>
      </div>
      <p>这里显示所有客户上传的照片</p>
    `;

    // 为每个用户生成照片列表
    users.forEach(user => {
      const userDir = path.join(uploadDir, user);
      const photos = fs.readdirSync(userDir).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
      });

      html += `
      <div class="user-section">
        <div class="user-title">客户：${user} 
          <a href="/download-all/${user}" class="btn btn-primary" style="margin-right: 5px;">下载所有照片</a>
          <button class="btn btn-danger" onclick="deleteUser('${user}')">删除该客户所有照片</button>
        </div>
        <div class="photo-grid">
      `;

      // 为每个照片生成缩略图和下载按钮
      photos.forEach(photo => {
        const photoUrl = `/uploads/${user}/${photo}`;
        html += `
        <div class="photo-item">
          <img src="${photoUrl}" alt="${photo}" class="photo-thumb" onclick="window.open('${photoUrl}', '_blank')">
          <div class="photo-info">
            <div style="font-size: 12px; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${photo}</div>
            <a href="${photoUrl}" class="btn" style="margin-right: 5px;" download="${user}_${photo}">下载</a>
            <button class="btn btn-danger" onclick="deletePhoto('${user}', '${photo}')" style="font-size: 12px; padding: 6px 10px;">删除</button>
          </div>
        </div>
        `;
      });

      html += `
        </div>
      </div>
      `;
    });

    // 添加JavaScript函数处理删除操作
    html += `
    <script>
      // 删除单个照片
      function deletePhoto(userName, photoName) {
        if (confirm('确定要删除这张照片吗？')) {
          fetch('/delete-photo/' + encodeURIComponent(userName) + '/' + encodeURIComponent(photoName), {
            method: 'DELETE'
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('照片删除成功');
              window.location.reload(); // 刷新页面
            } else {
              alert('删除失败：' + data.message);
            }
          })
          .catch(error => {
            logger.error('删除错误:', error);
            alert('删除失败，请稍后重试');
          });
        }
      }
      
      // 删除整个用户的照片
      function deleteUser(userName) {
        if (confirm('确定要删除该客户的所有照片吗？此操作不可恢复！')) {
          fetch('/delete-user/' + encodeURIComponent(userName), {
            method: 'DELETE'
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('客户照片删除成功');
              window.location.reload(); // 刷新页面
            } else {
              alert('删除失败：' + data.message);
            }
          })
          .catch(error => {
            console.error('删除错误:', error);
            alert('删除失败，请稍后重试');
          });
        }
      }
    </script>
    </body>
    </html>
    `;

    res.send(html);
  } catch (error) {
    res.status(500).json({ success: false, message: '生成管理界面失败', error: error.message });
  }
});

// 下载单个用户所有照片（生成ZIP文件）
app.get('/download-all/:userName', (req, res) => {
  const userName = req.params.userName;
  const userDir = path.join(uploadDir, userName);

  if (!fs.existsSync(userDir)) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  // 读取该用户的所有照片
  const photos = fs.readdirSync(userDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
  });

  if (photos.length === 0) {
    return res.status(404).json({ success: false, message: '该用户没有照片' });
  }

  try {
    // 创建ZIP文件
    const zipFileName = `${userName}_photos_${new Date().getTime()}.zip`;
    res.attachment(zipFileName);
    
    // 创建archiver实例
    const archive = archiver('zip', {
      zlib: { level: 9 } // 压缩级别
    });
    
    // 监听错误
    archive.on('error', (err) => {
      logger.error('ZIP生成错误:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'ZIP文件生成失败' });
      }
    });
    
    // 监听完成
    archive.on('finish', () => {
      logger.info('ZIP文件生成完成');
    });
    
    // 管道到响应
    archive.pipe(res);
    
    // 添加所有照片到ZIP
    photos.forEach(photo => {
      const filePath = path.join(userDir, photo);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        archive.file(filePath, { name: photo });
      }
    });
    
    // 完成压缩
    archive.finalize();
    
  } catch (error) {
    logger.error('批量下载错误:', error);
    res.status(500).json({ success: false, message: '批量下载失败' });
  }
});

// 获取用户照片列表API
app.get('/api/user-photos/:userName', (req, res) => {
  const userName = req.params.userName;
  const userDir = path.join(uploadDir, userName);

  if (!fs.existsSync(userDir)) {
    return res.status(404).json({ success: false, message: '用户不存在' });
  }

  // 读取该用户的所有照片
  const photos = fs.readdirSync(userDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
  });

  res.json({
    success: true,
    userName,
    photoCount: photos.length,
    photos: photos.map(photo => ({
      fileName: photo,
      downloadUrl: `/uploads/${userName}/${photo}`
    }))
  });
});

// 删除单个照片
app.delete('/delete-photo/:userName/:photoName', (req, res) => {
  // 检查登录状态
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ success: false, message: '需要登录' });
  }
  
  const { userName, photoName } = req.params;
  const photoPath = path.join(uploadDir, userName, photoName);
  
  try {
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
      logger.info(`删除照片：${userName}/${photoName}`);
      res.json({ success: true, message: '照片删除成功' });
    } else {
      res.status(404).json({ success: false, message: '照片不存在' });
    }
  } catch (error) {
    logger.error('删除照片错误:', error);
    res.status(500).json({ success: false, message: '照片删除失败' });
  }
});

// 删除整个用户的所有照片
app.delete('/delete-user/:userName', (req, res) => {
  // 检查登录状态
  if (!req.session.isAuthenticated) {
    return res.status(401).json({ success: false, message: '需要登录' });
  }
  
  const userName = req.params.userName;
  const userDir = path.join(uploadDir, userName);
  
  try {
    if (fs.existsSync(userDir)) {
      // 删除用户目录及其所有内容
      fs.rmSync(userDir, { recursive: true, force: true });
      logger.info(`删除用户所有照片：${userName}`);
      res.json({ success: true, message: '用户照片删除成功' });
    } else {
      res.status(404).json({ success: false, message: '用户不存在' });
    }
  } catch (error) {
    logger.error('删除用户照片错误:', error);
    res.status(500).json({ success: false, message: '用户照片删除失败' });
  }
});

// 根路由 - 健康检查
app.get('/', (req, res) => {
  logger.info('=== 收到根路由请求 ===');
  logger.info('客户端IP：', req.ip);
  logger.info('请求头：', req.headers);
  res.json({
    success: true,
    message: '服务器运行正常',
    uploadEndpoint: '/upload',
    adminEndpoint: '/admin',
    uploadDir: uploadDir,
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
// 使用环境变量或默认端口8000（抖音云要求）
const port = process.env.PORT || 8000;
// 监听所有接口，允许网络访问
app.listen(port, '0.0.0.0', () => {
  logger.info(`服务器运行在 http://0.0.0.0:${port}`);
  logger.info(`上传目录：${uploadDir}`);
  logger.info(`测试地址：http://127.0.0.1:${port}/`);
  logger.info(`网络访问地址：http://10.185.210.1:${port}/`);
  logger.info(`环境变量PORT：${process.env.PORT}`);
  logger.info(`日志目录：${logDir}`);
});
