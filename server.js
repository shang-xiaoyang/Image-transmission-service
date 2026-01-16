const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const session = require('express-session');
const archiver = require('archiver');

// 设置archiver的并发限制
archiver.defaults = {
  zlib: { level: 9 }
};

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  console.log(`${timestamp} - 客户端IP：`, req.ip);
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

// 辅助函数：读取所有管理员用户
function readAdminUsers() {
  try {
    const data = fs.readFileSync(adminUsersPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取管理员用户文件失败:', error);
    return [];
  }
}

// 辅助函数：保存管理员用户
function saveAdminUsers(users) {
  try {
    fs.writeFileSync(adminUsersPath, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('保存管理员用户文件失败:', error);
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
      console.error('登出失败:', err);
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
            console.error('删除错误:', error);
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
      console.error('ZIP生成错误:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'ZIP文件生成失败' });
      }
    });
    
    // 监听完成
    archive.on('finish', () => {
      console.log('ZIP文件生成完成');
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
    console.error('批量下载错误:', error);
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
      console.log(`删除照片：${userName}/${photoName}`);
      res.json({ success: true, message: '照片删除成功' });
    } else {
      res.status(404).json({ success: false, message: '照片不存在' });
    }
  } catch (error) {
    console.error('删除照片错误:', error);
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
      console.log(`删除用户所有照片：${userName}`);
      res.json({ success: true, message: '用户照片删除成功' });
    } else {
      res.status(404).json({ success: false, message: '用户不存在' });
    }
  } catch (error) {
    console.error('删除用户照片错误:', error);
    res.status(500).json({ success: false, message: '用户照片删除失败' });
  }
});

// 测试路由
app.get('/', (req, res) => {
  res.json({
    message: '服务器运行正常',
    uploadEndpoint: '/upload',
    adminEndpoint: '/admin',
    uploadDir: uploadDir
  });
});

// 启动服务器
// 使用环境变量或默认端口8000（抖音云要求）
const port = process.env.PORT || 8000;
// 监听所有接口，允许网络访问
app.listen(port, '0.0.0.0', () => {
  console.log(`服务器运行在 http://0.0.0.0:${port}`);
  console.log(`上传目录：${uploadDir}`);
  console.log(`测试地址：http://127.0.0.1:${port}/`);
  console.log(`网络访问地址：http://10.185.210.1:${port}/`);
  console.log(`环境变量PORT：${process.env.PORT}`);
});
