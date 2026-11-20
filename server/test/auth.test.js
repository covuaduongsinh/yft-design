import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createTestApp } from './helpers.js';

describe('xác thực', () => {
  let t;
  before(() => {
    t = createTestApp();
  });
  after(() => t.cleanup());

  test('health và config công khai', async () => {
    const health = await t.api('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
    const config = await t.api('GET', '/api/design/config');
    assert.equal(config.body.data.registration_open, true);
    assert.equal(config.body.data.features.matting, false);
  });

  test('đăng ký trả luôn phiên đăng nhập, không lộ mật khẩu', async () => {
    const res = await t.api('POST', '/api/oauth/register', {
      body: { email: '  Lan@Example.com ', password: 'mat-khau-123', ...(await t.captcha()) },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.code, 200);
    assert.equal(res.body.data.user.email, 'lan@example.com');
    assert.equal(res.body.data.user.is_staff, false);
    assert.equal(res.body.data.user.is_superuser, false);
    assert.ok(res.body.data.access_token.length >= 40);
    assert.equal(JSON.stringify(res.body).includes('password'), false);

    const row = t.db.prepare('SELECT password_hash FROM users WHERE email = ?').get('lan@example.com');
    assert.match(row.password_hash, /^scrypt\$/);
    assert.equal(row.password_hash.includes('mat-khau-123'), false);
  });

  test('đăng ký trùng email, email sai, mật khẩu ngắn đều bị từ chối', async () => {
    const dup = await t.api('POST', '/api/oauth/register', {
      body: { email: 'LAN@example.com', password: 'mat-khau-123', ...(await t.captcha()) },
    });
    assert.equal(dup.status, 400);
    assert.equal(dup.body.error, 'email_taken');

    const bad = await t.api('POST', '/api/oauth/register', {
      body: { email: 'khong-phai-email', password: 'mat-khau-123', ...(await t.captcha()) },
    });
    assert.equal(bad.status, 400);

    const weak = await t.api('POST', '/api/oauth/register', {
      body: { email: 'moi@example.com', password: '123', ...(await t.captcha()) },
    });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error, 'weak_password');
  });

  test('captcha: sai mã, dùng lại và mã vạn năng cũ đều bị từ chối', async () => {
    const creds = { email: 'lan@example.com', password: 'mat-khau-123' };

    const wrong = await t.captcha();
    const res1 = await t.api('POST', '/api/oauth/login', { body: { ...creds, ...wrong, captcha: '0000' } });
    assert.equal(res1.body.error, 'invalid_captcha');
    // Captcha đã bị tiêu thụ sau lần nhập sai: nhập đúng mã cũ cũng không dùng lại được.
    const res2 = await t.api('POST', '/api/oauth/login', { body: { ...creds, ...wrong } });
    assert.equal(res2.body.error, 'invalid_captcha');

    for (const master of ['8888', '1234']) {
      const res = await t.api('POST', '/api/oauth/login', { body: { ...creds, captcha: master } });
      assert.equal(res.body.error, 'invalid_captcha', `mã ${master} không được chấp nhận khi thiếu captcha_id`);
    }

    const fresh = await t.captcha();
    const okLogin = await t.api('POST', '/api/oauth/login', { body: { ...creds, ...fresh } });
    assert.equal(okLogin.status, 200);
    const replay = await t.api('POST', '/api/oauth/login', { body: { ...creds, ...fresh } });
    assert.equal(replay.body.error, 'invalid_captcha');
  });

  test('sai mật khẩu và email không tồn tại trả cùng một lỗi', async () => {
    const wrongPassword = await t.api('POST', '/api/oauth/login', {
      body: { email: 'lan@example.com', password: 'sai-mat-khau', ...(await t.captcha()) },
    });
    const unknown = await t.api('POST', '/api/oauth/login', {
      body: { email: 'khong-co@example.com', password: 'sai-mat-khau', ...(await t.captcha()) },
    });
    assert.equal(wrongPassword.status, 400);
    assert.equal(unknown.status, 400);
    assert.deepEqual(
      { error: wrongPassword.body.error, msg: wrongPassword.body.msg },
      { error: unknown.body.error, msg: unknown.body.msg },
    );
  });

  test('token: /me cần token hợp lệ; đăng xuất thu hồi token ở server', async () => {
    const { token } = await t.signUp('minh@example.com');
    assert.equal((await t.api('GET', '/api/oauth/me')).status, 401);
    assert.equal((await t.api('GET', '/api/oauth/me', { token: 'token-gia' })).status, 401);

    const me = await t.api('GET', '/api/oauth/me', { token });
    assert.equal(me.body.data.user.email, 'minh@example.com');

    // Token gốc không nằm trong CSDL, chỉ có hàm băm.
    const stored = t.db.prepare('SELECT token_hash FROM sessions').all().map((row) => row.token_hash);
    assert.equal(stored.includes(token), false);

    assert.equal((await t.api('POST', '/api/oauth/logout', { token })).status, 200);
    assert.equal((await t.api('GET', '/api/oauth/me', { token })).status, 401);
  });

  test('phiên hết hạn và tài khoản bị khoá không dùng được', async () => {
    const expired = await t.signUp('het-han@example.com');
    t.db.prepare('UPDATE sessions SET expires_at = 1 WHERE user_id = ?').run(expired.user.id);
    assert.equal((await t.api('GET', '/api/oauth/me', { token: expired.token })).status, 401);

    const disabled = await t.signUp('bi-khoa@example.com');
    t.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(disabled.user.id);
    assert.equal((await t.api('GET', '/api/oauth/me', { token: disabled.token })).status, 401);
    const login = await t.api('POST', '/api/oauth/login', {
      body: { email: 'bi-khoa@example.com', password: disabled.password, ...(await t.captcha()) },
    });
    assert.equal(login.body.error, 'invalid_credentials');
  });

  test('đổi mật khẩu: cần mật khẩu cũ, huỷ các phiên khác, giữ phiên hiện tại', async () => {
    const first = await t.signUp('doi@example.com', 'mat-khau-cu-1');
    const second = await t.api('POST', '/api/oauth/login', {
      body: { email: 'doi@example.com', password: 'mat-khau-cu-1', ...(await t.captcha()) },
    });
    const otherToken = second.body.data.access_token;

    const wrong = await t.api('POST', '/api/oauth/password/change', {
      token: first.token,
      body: { old_password: 'khong-dung', new_password: 'mat-khau-moi-2' },
    });
    assert.equal(wrong.status, 400);

    const changed = await t.api('POST', '/api/oauth/password/change', {
      token: first.token,
      body: { old_password: 'mat-khau-cu-1', new_password: 'mat-khau-moi-2' },
    });
    assert.equal(changed.status, 200);
    assert.equal((await t.api('GET', '/api/oauth/me', { token: first.token })).status, 200);
    assert.equal((await t.api('GET', '/api/oauth/me', { token: otherToken })).status, 401);

    const oldLogin = await t.api('POST', '/api/oauth/login', {
      body: { email: 'doi@example.com', password: 'mat-khau-cu-1', ...(await t.captcha()) },
    });
    assert.equal(oldLogin.status, 400);
    const newLogin = await t.api('POST', '/api/oauth/login', {
      body: { email: 'doi@example.com', password: 'mat-khau-moi-2', ...(await t.captcha()) },
    });
    assert.equal(newLogin.status, 200);
  });
});

describe('khoá tạm khi đăng nhập sai', () => {
  test('sau N lần sai thì khoá, kể cả khi nhập đúng mật khẩu', async () => {
    const t = createTestApp({ LOGIN_MAX_FAILURES: '3', LOGIN_LOCK_MINUTES: '15' });
    try {
      const { password } = await t.signUp('khoa@example.com');
      for (let i = 0; i < 3; i++) {
        const res = await t.api('POST', '/api/oauth/login', {
          body: { email: 'khoa@example.com', password: 'sai', ...(await t.captcha()) },
        });
        assert.equal(res.status, 400);
      }
      const locked = await t.api('POST', '/api/oauth/login', {
        body: { email: 'khoa@example.com', password, ...(await t.captcha()) },
      });
      assert.equal(locked.status, 429);

      // Hết thời gian khoá thì đăng nhập lại được.
      t.db.prepare('UPDATE login_attempts SET locked_until = 1').run();
      const open = await t.api('POST', '/api/oauth/login', {
        body: { email: 'khoa@example.com', password, ...(await t.captcha()) },
      });
      assert.equal(open.status, 200);
    } finally {
      t.cleanup();
    }
  });

  test('giới hạn tần suất theo IP trả 429', async () => {
    const t = createTestApp({ AUTH_RATE_PER_MINUTE: '3' });
    try {
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await t.api('GET', '/api/oauth/captcha/image')).status);
      assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    } finally {
      t.cleanup();
    }
  });
});

describe('phân quyền ở server', () => {
  let t;
  let user;
  let admin;
  before(async () => {
    t = createTestApp();
    user = await t.signUp('thuong@example.com');
    admin = await t.signUp('quan-tri@example.com');
    t.setRole(admin.user.id, { staff: true, superuser: true });
  });
  after(() => t.cleanup());

  test('user thường và khách không gọi được API quản trị', async () => {
    assert.equal((await t.api('GET', '/api/admin/users')).status, 401);
    assert.equal((await t.api('GET', '/api/admin/users', { token: user.token })).status, 403);
    const patch = await t.api('PATCH', `/api/admin/users/${user.user.id}`, {
      token: user.token,
      body: { is_superuser: true },
    });
    assert.equal(patch.status, 403);
    assert.equal(t.db.prepare('SELECT is_superuser FROM users WHERE id = ?').get(user.user.id).is_superuser, 0);
  });

  test('superuser xem danh sách, cấp quyền, và khoá tài khoản huỷ luôn phiên', async () => {
    const list = await t.api('GET', '/api/admin/users?q=thuong', { token: admin.token });
    assert.equal(list.body.data.total, 1);
    assert.equal(list.body.data.items[0].email, 'thuong@example.com');

    const promoted = await t.api('PATCH', `/api/admin/users/${user.user.id}`, {
      token: admin.token,
      body: { is_staff: true },
    });
    assert.equal(promoted.body.data.user.is_staff, true);

    const disabled = await t.api('PATCH', `/api/admin/users/${user.user.id}`, {
      token: admin.token,
      body: { is_active: false },
    });
    assert.equal(disabled.status, 200);
    assert.equal((await t.api('GET', '/api/oauth/me', { token: user.token })).status, 401);
  });

  test('không thể hạ quyền hoặc khoá quản trị viên cuối cùng', async () => {
    for (const body of [{ is_superuser: false }, { is_active: false }]) {
      const res = await t.api('PATCH', `/api/admin/users/${admin.user.id}`, { token: admin.token, body });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'last_superuser');
    }
  });

  test('trường lạ trong body bị từ chối', async () => {
    const res = await t.api('PATCH', `/api/admin/users/${user.user.id}`, {
      token: admin.token,
      body: { email: 'hack@example.com' },
    });
    assert.equal(res.status, 400);
  });
});

describe('tuỳ chọn cấu hình', () => {
  test('đóng đăng ký', async () => {
    const t = createTestApp({ REGISTRATION_OPEN: 'false' });
    try {
      const res = await t.api('POST', '/api/oauth/register', {
        body: { email: 'a@example.com', password: 'mat-khau-123', ...(await t.captcha()) },
      });
      assert.equal(res.status, 403);
    } finally {
      t.cleanup();
    }
  });

  test('OTP email: gửi mã, sai mã bị từ chối, đúng mã đăng ký được', async () => {
    const t = createTestApp({ REQUIRE_EMAIL_OTP: 'true', SMTP_URL: 'smtp://localhost:1025' });
    try {
      const sent = await t.api('POST', '/api/oauth/captcha/email', { body: { email: 'otp@example.com' } });
      assert.equal(sent.status, 200);
      assert.equal(t.sent.length, 1);
      assert.match(t.sent[0].text, /123456/);
      // Phản hồi không được chứa mã OTP.
      assert.equal(JSON.stringify(sent.body).includes('123456'), false);

      const cooldown = await t.api('POST', '/api/oauth/captcha/email', { body: { email: 'otp@example.com' } });
      assert.equal(cooldown.status, 429);

      const wrong = await t.api('POST', '/api/oauth/register', {
        body: { email: 'otp@example.com', password: 'mat-khau-123', captcha: '000000' },
      });
      assert.equal(wrong.body.error, 'invalid_captcha');

      const right = await t.api('POST', '/api/oauth/register', {
        body: { email: 'otp@example.com', password: 'mat-khau-123', captcha: '123456' },
      });
      assert.equal(right.status, 200);
    } finally {
      t.cleanup();
    }
  });

  test('ADMIN_EMAIL chỉ tạo quản trị viên khi chưa có ai', async () => {
    const t = createTestApp({ ADMIN_EMAIL: 'Chu@Example.com', ADMIN_PASSWORD: 'mat-khau-quan-tri' });
    try {
      assert.equal(await t.ctx.auth.ensureAdmin(), 'chu@example.com');
      const row = t.db.prepare('SELECT is_superuser, is_staff FROM users WHERE email = ?').get('chu@example.com');
      assert.deepEqual({ ...row }, { is_superuser: 1, is_staff: 1 });
      // Lần khởi động sau không tạo thêm và không đặt lại mật khẩu.
      const before = t.db.prepare('SELECT password_hash FROM users WHERE email = ?').get('chu@example.com').password_hash;
      assert.equal(await t.ctx.auth.ensureAdmin(), null);
      const afterHash = t.db.prepare('SELECT password_hash FROM users WHERE email = ?').get('chu@example.com').password_hash;
      assert.equal(afterHash, before);
    } finally {
      t.cleanup();
    }
  });
});
