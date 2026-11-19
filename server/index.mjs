import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCaptcha } from './captcha.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const PORT = process.env.PORT || 8788;

// In-memory captcha cache: Set of active codes
const activeCaptchas = new Set();
let latestCaptcha = '8888';

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Lỗi đọc database users.json:', err);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Lỗi ghi database users.json:', err);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Read request body for POST/PUT
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let parsedBody = {};
    if (body) {
      try { parsedBody = JSON.parse(body); } catch (_) {}
    }

    // 1. Health check
    if (pathname === '/api/health' || pathname === '/health') {
      return sendJson(res, 200, {
        code: 200,
        status: 'ok',
        service: 'yft-design-custom-auth-server',
        timestamp: new Date().toISOString()
      });
    }

    // 1b. Mock Template Info Pages for Home
    if (pathname.startsWith('/api/design/template') && req.method === 'GET') {
      return sendJson(res, 200, {
        code: 200,
        data: {
          total: 0,
          page: 1,
          total_pages: 1,
          size: 30,
          pages: 1,
          items: []
        },
        msg: 'success'
      });
    }

    // 2. GET /api/oauth/captcha/image
    if (pathname === '/api/oauth/captcha/image' && req.method === 'GET') {
      const captcha = generateCaptcha();
      activeCaptchas.add(captcha.code);
      latestCaptcha = captcha.code;
      // Keep only last 20 captchas
      if (activeCaptchas.size > 20) {
        const oldest = activeCaptchas.values().next().value;
        activeCaptchas.delete(oldest);
      }

      console.log(`[CAPTCHA] Mã mới được tạo: ${captcha.code}`);
      return sendJson(res, 200, {
        code: 200,
        data: {
          image: captcha.base64,
          image_type: 'png'
        },
        msg: 'success'
      });
    }

    // 3. POST /api/oauth/captcha/email
    if (pathname === '/api/oauth/captcha/email' && req.method === 'POST') {
      const email = parsedBody.email;
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      activeCaptchas.add(otpCode);
      console.log(`[EMAIL OTP] Đã gửi mã ${otpCode} tới email: ${email}`);
      return sendJson(res, 200, {
        code: 200,
        data: {
          msg: `Mã OTP xác thực (${otpCode}) đã được gửi tới ${email}`
        },
        msg: 'success'
      });
    }

    // 4. POST /api/oauth/login
    if (pathname === '/api/oauth/login' && req.method === 'POST') {
      const { email, password, captcha } = parsedBody;
      console.log(`[LOGIN] Thử đăng nhập: email=${email}`);

      // Verify captcha (allow exact match, active codes, or master code 8888/1234)
      const isCaptchaValid = 
        captcha === '8888' ||
        captcha === '1234' ||
        captcha === latestCaptcha ||
        activeCaptchas.has(captcha);

      if (!isCaptchaValid) {
        return sendJson(res, 200, {
          code: 400,
          msg: 'Mã xác thực (Captcha) không chính xác hoặc đã hết hạn!'
        });
      }

      const users = loadUsers();
      const user = users.find(u => u.email.toLowerCase() === (email || '').toLowerCase().trim());

      if (!user || user.password !== password) {
        return sendJson(res, 200, {
          code: 400,
          msg: 'Email hoặc mật khẩu không chính xác!'
        });
      }

      // Update last login
      user.last_login_time = new Date().toISOString().replace('T', ' ').substring(0, 19);
      saveUsers(users);

      const tokenPayload = Buffer.from(`${user.email}:${Date.now()}`).toString('base64');
      const token = `yft_jwt_${tokenPayload}`;

      const { password: _, ...userSafe } = user;

      console.log(`[LOGIN THÀNH CÔNG] User: ${user.username} (Role: Superuser=${user.is_superuser}, Staff=${user.is_staff})`);

      return sendJson(res, 200, {
        code: 200,
        data: {
          access_token: token,
          access_token_expire_time: '2099-12-31 23:59:59',
          access_token_type: 'Bearer',
          refresh_token: `yft_refresh_${tokenPayload}`,
          refresh_token_expire_time: '2099-12-31 23:59:59',
          refresh_token_type: 'Bearer',
          user: userSafe
        },
        msg: '登录成功'
      });
    }

    // 5. POST /api/oauth/register
    if (pathname === '/api/oauth/register' && req.method === 'POST') {
      const { email, password, captcha } = parsedBody;
      console.log(`[REGISTER] Đăng ký tài khoản mới: email=${email}`);

      if (!email || !password) {
        return sendJson(res, 200, {
          code: 400,
          msg: 'Vui lòng nhập đầy đủ Email và Mật khẩu!'
        });
      }

      const users = loadUsers();
      const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (existing) {
        return sendJson(res, 200, {
          code: 400,
          msg: 'Email này đã tồn tại trong hệ thống!'
        });
      }

      const newUser = {
        id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
        uuid: `u-${Date.now()}`,
        username: email.split('@')[0],
        nickname: email.split('@')[0],
        email: email.trim(),
        password: password,
        phone: '',
        avatar: '',
        dept_id: 3,
        is_multi_login: false,
        is_staff: false,
        is_superuser: false,
        join_time: new Date().toISOString().replace('T', ' ').substring(0, 19),
        last_login_time: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };

      users.push(newUser);
      saveUsers(users);

      const autoLoginCaptcha = captcha || '8888';
      activeCaptchas.add(autoLoginCaptcha);

      console.log(`[REGISTER THÀNH CÔNG] User mới: ${newUser.username}`);

      // Returns code for frontend handleRegister() to perform auto-login
      return sendJson(res, 200, {
        code: 200,
        data: {
          code: autoLoginCaptcha
        },
        msg: '注册成功'
      });
    }

    // 6. GET /api/oauth/github/token
    if (pathname === '/api/oauth/github/token' && req.method === 'GET') {
      return sendJson(res, 200, {
        code: 200,
        data: `http://localhost:${PORT}/oauth/github/mock-callback`,
        msg: 'success'
      });
    }

    // 7. POST /api/oauth/token/wechat
    if (pathname === '/api/oauth/token/wechat' && req.method === 'POST') {
      const qrCaptcha = generateCaptcha('8888');
      return sendJson(res, 200, {
        code: 200,
        data: {
          img: 'data:image/png;base64,' + qrCaptcha.base64
        },
        msg: 'success'
      });
    }

    // 8. Fallback 404
    return sendJson(res, 404, {
      code: 404,
      msg: `Endpoint không tồn tại: ${pathname}`
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`====================================================`);
  console.log(`🚀 yft-design Custom Auth Server đang chạy tại:`);
  console.log(`👉 http://127.0.0.1:${PORT}`);
  console.log(`Endpoints hỗ trợ:`);
  console.log(` - GET  /api/oauth/captcha/image`);
  console.log(` - POST /api/oauth/captcha/email`);
  console.log(` - POST /api/oauth/login`);
  console.log(` - POST /api/oauth/register`);
  console.log(` - GET  /api/oauth/github/token`);
  console.log(`====================================================`);
});
