import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/core/config.js';
import { openDb } from '../src/core/db.js';
import { migrate } from '../src/core/migrate.js';

/**
 * Dựng một server thử nghiệm: CSDL trong bộ nhớ, thư mục dữ liệu tạm,
 * captcha luôn là "1234" và OTP email được gom vào `sent`.
 */
export function createTestApp(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yft-test-'));
  const config = loadConfig({ DATA_DIR: dataDir, DB_FILE: ':memory:', AUTH_RATE_PER_MINUTE: '0', ...env });
  fs.mkdirSync(config.mediaDir, { recursive: true });
  const db = openDb(':memory:');
  migrate(db, path.join(config.serverRoot, 'migrations'));

  /** @type {Array<{ to: string, subject: string, text: string }>} */
  const sent = [];
  const mailer = {
    enabled: Boolean(config.smtpUrl),
    async send(message) {
      sent.push(message);
    },
  };
  const { app, ctx, close } = createApp({
    config,
    db,
    deps: { mailer, randomDigits: (length) => '1234567890'.slice(0, length) },
  });

  /** Gọi API bằng JSON; trả về { status, body }. */
  async function api(method, url, { body, token, headers = {}, raw } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (raw !== undefined) {
      init.body = raw;
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await app.request(url, init);
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed, headers: response.headers, response };
  }

  /** Lấy captcha mới rồi trả về cặp trường cần gửi kèm (mã luôn là 1234 trong test). */
  async function captcha() {
    const { body } = await api('GET', '/api/oauth/captcha/image');
    return { captcha: '1234', captcha_id: body.data.captcha_id };
  }

  /** Đăng ký nhanh một tài khoản, trả về { token, user }. */
  async function signUp(email, password = 'mat-khau-123') {
    const { status, body } = await api('POST', '/api/oauth/register', {
      body: { email, password, ...(await captcha()) },
    });
    if (status !== 200) throw new Error(`Đăng ký thất bại: ${JSON.stringify(body)}`);
    return { token: body.data.access_token, user: body.data.user, password };
  }

  function setRole(userId, { staff = false, superuser = false }) {
    db.prepare('UPDATE users SET is_staff = ?, is_superuser = ? WHERE id = ?').run(staff ? 1 : 0, superuser ? 1 : 0, userId);
  }

  function cleanup() {
    close();
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return { app, ctx, db, config, api, captcha, signUp, setRole, sent, cleanup };
}
