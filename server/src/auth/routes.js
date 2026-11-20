import { Hono } from 'hono';
import { z } from 'zod';
import { ok, readJson } from '../core/http.js';
import { clientIp } from '../core/security.js';
import { userView } from './service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const email = z.string().trim().max(254).regex(EMAIL_RE, 'Email không hợp lệ');
const optionalText = z.union([z.string(), z.number()]).optional().transform((value) => (value === undefined ? '' : String(value)));

const credentials = z.object({
  email,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(200, 'Mật khẩu quá dài'),
  captcha: optionalText,
  captcha_id: optionalText,
});

const passwordChange = z.object({
  old_password: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại').max(200, 'Mật khẩu quá dài'),
  new_password: z.string().min(1, 'Vui lòng nhập mật khẩu mới').max(200, 'Mật khẩu quá dài'),
});

/** Các endpoint xác thực, gắn dưới /api/oauth. */
export function authRoutes({ auth, config, limiters, guard }) {
  const app = new Hono();

  const meta = (c) => ({ ip: clientIp(c, config.trustProxyHops), userAgent: c.req.header('user-agent') || '' });
  const throttle = async (c, next) => {
    limiters.auth.hit(`auth:${clientIp(c, config.trustProxyHops)}`);
    await next();
  };

  app.get('/captcha/image', throttle, (c) => ok(c, auth.issueCaptcha()));

  app.post('/captcha/email', throttle, async (c) => {
    const body = await readJson(c, z.object({ email }));
    await auth.sendEmailOtp(body.email);
    return ok(c, { msg: `Mã xác thực đã được gửi tới ${body.email}` });
  });

  app.post('/register', throttle, async (c) => {
    const body = await readJson(c, credentials);
    const payload = await auth.register(
      { email: body.email, password: body.password, captcha: body.captcha, captchaId: body.captcha_id },
      meta(c),
    );
    return ok(c, payload, 'Đăng ký thành công');
  });

  app.post('/login', throttle, async (c) => {
    const body = await readJson(c, credentials);
    const payload = await auth.login(
      { email: body.email, password: body.password, captcha: body.captcha, captchaId: body.captcha_id },
      meta(c),
    );
    return ok(c, payload, 'Đăng nhập thành công');
  });

  app.post('/logout', guard.requireUser, (c) => {
    auth.logout(c.get('tokenHash'));
    return ok(c, null, 'Đã đăng xuất');
  });

  app.get('/me', guard.requireUser, (c) => ok(c, { user: userView(c.get('user')) }));

  app.post('/password/change', throttle, guard.requireUser, async (c) => {
    const body = await readJson(c, passwordChange);
    await auth.changePassword(
      c.get('user'),
      { oldPassword: body.old_password, newPassword: body.new_password },
      c.get('tokenHash'),
    );
    return ok(c, null, 'Đã đổi mật khẩu');
  });

  return app;
}

const userPatch = z
  .object({
    is_staff: z.boolean().optional(),
    is_superuser: z.boolean().optional(),
    is_active: z.boolean().optional(),
    nickname: z.string().trim().min(1).max(60).optional(),
    password: z.string().max(200).optional(),
  })
  .strict();

const userQuery = z.object({
  q: z.string().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  size: z.coerce.number().int().min(1).max(100).optional().default(20),
});

/** Quản trị người dùng, gắn dưới /api/admin — chỉ dành cho superuser. */
export function adminUserRoutes({ auth, guard }) {
  const app = new Hono();
  app.use('*', guard.requireSuperuser);

  app.get('/users', (c) => {
    const query = userQuery.safeParse(c.req.query());
    return ok(c, auth.listUsers(query.success ? query.data : { q: '', page: 1, size: 20 }));
  });

  app.patch('/users/:id', async (c) => {
    const body = await readJson(c, userPatch);
    const user = await auth.updateUser(c.get('user'), Number(c.req.param('id')), body);
    return ok(c, { user }, 'Đã cập nhật người dùng');
  });

  return app;
}
