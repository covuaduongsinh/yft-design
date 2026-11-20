import crypto from 'node:crypto';
import { AppError, badRequest, forbidden, tooMany } from '../core/http.js';
import { formatTime } from '../core/db.js';
import { randomId, randomToken, sha256, uuid } from '../core/security.js';
import { generateCaptcha } from './captcha-image.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './passwords.js';

const CAPTCHA_TTL_MS = 5 * 60_000;
const OTP_TTL_MS = 10 * 60_000;
const OTP_COOLDOWN_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TOUCH_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const INVALID_CREDENTIALS = 'Email hoặc mật khẩu không chính xác';

/** Dạng người dùng mà frontend đang đọc (xem src/api/oauth/types.ts). */
export function userView(row) {
  return {
    id: row.id,
    uuid: row.uuid,
    username: row.username,
    nickname: row.nickname || row.username,
    phone: row.phone,
    avatar: row.avatar,
    dept_id: row.is_superuser ? 1 : row.is_staff ? 2 : 3,
    email: row.email,
    is_multi_login: true,
    is_staff: Boolean(row.is_staff),
    is_superuser: Boolean(row.is_superuser),
    is_active: Boolean(row.is_active),
    join_time: formatTime(row.created_at),
    last_login_time: formatTime(row.last_login_at),
  };
}

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * @param {{ db: import('better-sqlite3').Database, config: ReturnType<import('../core/config.js').loadConfig>,
 *           mailer: { enabled: boolean, send: Function }, randomDigits?: (length: number) => string }} deps
 */
export function createAuthService({ db, config, mailer, randomDigits = defaultRandomDigits }) {
  const sessionTtlMs = config.sessionTtlDays * DAY_MS;

  // ---------- Captcha ảnh ----------

  function issueCaptcha() {
    const id = randomId();
    const { code, base64 } = generateCaptcha(randomDigits(4));
    db.prepare('INSERT INTO captchas (id, code_hash, expires_at) VALUES (?, ?, ?)').run(
      id,
      sha256(`${id}:${code}`),
      Date.now() + CAPTCHA_TTL_MS,
    );
    return { captcha_id: id, image: base64, image_type: 'png' };
  }

  /** Mỗi captcha chỉ dùng được một lần, dù nhập đúng hay sai. */
  function consumeCaptcha(id, code) {
    if (!config.captchaEnabled) return;
    const row = id ? db.prepare('DELETE FROM captchas WHERE id = ? RETURNING code_hash, expires_at').get(String(id)) : null;
    const valid = row && row.expires_at > Date.now() && row.code_hash === sha256(`${id}:${String(code || '').trim()}`);
    if (!valid) throw badRequest('invalid_captcha', 'Mã xác thực không chính xác hoặc đã hết hạn');
  }

  // ---------- OTP qua email ----------

  async function sendEmailOtp(rawEmail) {
    if (!mailer.enabled) throw badRequest('email_not_configured', 'Máy chủ chưa cấu hình gửi email');
    const email = normalizeEmail(rawEmail);
    const t = Date.now();
    const existing = db.prepare('SELECT sent_at FROM email_otps WHERE email = ?').get(email);
    if (existing && t - existing.sent_at < OTP_COOLDOWN_MS) {
      throw tooMany('Vui lòng chờ một phút trước khi yêu cầu mã mới');
    }
    const code = randomDigits(6);
    db.prepare(
      `INSERT INTO email_otps (email, code_hash, attempts, sent_at, expires_at) VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0,
         sent_at = excluded.sent_at, expires_at = excluded.expires_at`,
    ).run(email, sha256(`${email}:${code}`), t, t + OTP_TTL_MS);
    await mailer.send({
      to: email,
      subject: 'Mã xác thực yft-design',
      text: `Mã xác thực của bạn là ${code}. Mã có hiệu lực trong 10 phút.`,
    });
  }

  function consumeEmailOtp(email, code) {
    const row = db.prepare('SELECT code_hash, attempts, expires_at FROM email_otps WHERE email = ?').get(email);
    const invalid = () => badRequest('invalid_captcha', 'Mã xác thực email không chính xác hoặc đã hết hạn');
    if (!row || row.expires_at <= Date.now() || row.attempts >= OTP_MAX_ATTEMPTS) throw invalid();
    if (row.code_hash !== sha256(`${email}:${String(code || '').trim()}`)) {
      db.prepare('UPDATE email_otps SET attempts = attempts + 1 WHERE email = ?').run(email);
      throw invalid();
    }
    db.prepare('DELETE FROM email_otps WHERE email = ?').run(email);
  }

  // ---------- Phiên đăng nhập ----------

  function createSession(userId, { ip = '', userAgent = '' } = {}) {
    const token = randomToken();
    const t = Date.now();
    db.prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(sha256(token), userId, t, t, t + sessionTtlMs, ip, String(userAgent).slice(0, 255));
    return { token, expiresAt: t + sessionTtlMs };
  }

  function sessionPayload(user, session) {
    return {
      access_token: session.token,
      access_token_expire_time: formatTime(session.expiresAt),
      access_token_type: 'Bearer',
      user: userView(user),
    };
  }

  /** @returns {{ user: object, tokenHash: string } | null} */
  function authenticate(token) {
    if (!token) return null;
    const tokenHash = sha256(token);
    const row = db
      .prepare(
        `SELECT s.last_used_at, s.expires_at AS session_expires_at, u.*
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      )
      .get(tokenHash);
    if (!row) return null;
    const t = Date.now();
    if (row.session_expires_at <= t || !row.is_active) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    // Gia hạn trượt, nhưng không ghi DB ở mỗi request.
    if (t - row.last_used_at > SESSION_TOUCH_MS) {
      db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?').run(
        t,
        t + sessionTtlMs,
        tokenHash,
      );
    }
    return { user: row, tokenHash };
  }

  function logout(tokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  // ---------- Khoá tạm khi đăng nhập sai ----------

  function assertNotLocked(email, ip) {
    const row = db.prepare('SELECT locked_until FROM login_attempts WHERE email = ? AND ip = ?').get(email, ip);
    if (row && row.locked_until > Date.now()) {
      const minutes = Math.ceil((row.locked_until - Date.now()) / 60_000);
      throw tooMany(`Đăng nhập sai quá nhiều lần, vui lòng thử lại sau ${minutes} phút`, { retry_after: minutes * 60 });
    }
  }

  function recordFailure(email, ip) {
    const t = Date.now();
    const row = db
      .prepare(
        `INSERT INTO login_attempts (email, ip, failures, locked_until, updated_at) VALUES (?, ?, 1, 0, ?)
         ON CONFLICT(email, ip) DO UPDATE SET failures = failures + 1, updated_at = excluded.updated_at
         RETURNING failures`,
      )
      .get(email, ip, t);
    if (row.failures >= config.loginMaxFailures) {
      db.prepare('UPDATE login_attempts SET failures = 0, locked_until = ? WHERE email = ? AND ip = ?').run(
        t + config.loginLockMinutes * 60_000,
        email,
        ip,
      );
    }
  }

  // ---------- Đăng ký / đăng nhập ----------

  function findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  async function createUser({ email, password, isStaff = false, isSuperuser = false, emailVerified = false, username }) {
    const passwordHash = await hashPassword(password);
    const t = Date.now();
    const name = (username || email.split('@')[0]).slice(0, 60);
    try {
      const info = db
        .prepare(
          `INSERT INTO users (uuid, email, username, nickname, password_hash, is_staff, is_superuser,
                              email_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(uuid(), email, name, name, passwordHash, isStaff ? 1 : 0, isSuperuser ? 1 : 0, emailVerified ? 1 : 0, t, t);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    } catch (err) {
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
        throw badRequest('email_taken', 'Email này đã được đăng ký');
      }
      throw err;
    }
  }

  function assertPasswordPolicy(password) {
    if (typeof password !== 'string' || password.length < config.passwordMinLength) {
      throw badRequest('weak_password', `Mật khẩu phải có ít nhất ${config.passwordMinLength} ký tự`);
    }
    if (password.length > 200) throw badRequest('weak_password', 'Mật khẩu quá dài');
  }

  async function register({ email: rawEmail, password, captcha, captchaId }, meta) {
    if (!config.registrationOpen) throw forbidden('Hệ thống hiện không mở đăng ký tài khoản mới');
    const email = normalizeEmail(rawEmail);
    assertPasswordPolicy(password);
    if (config.requireEmailOtp) consumeEmailOtp(email, captcha);
    else consumeCaptcha(captchaId, captcha);

    const user = await createUser({ email, password, emailVerified: config.requireEmailOtp });
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
    user.last_login_at = Date.now();
    return sessionPayload(user, createSession(user.id, meta));
  }

  async function login({ email: rawEmail, password, captcha, captchaId }, meta) {
    const email = normalizeEmail(rawEmail);
    const ip = meta.ip || '';
    consumeCaptcha(captchaId, captcha);
    assertNotLocked(email, ip);

    const user = findByEmail(email);
    // Sai mật khẩu, email không tồn tại và tài khoản bị khoá đều trả cùng một lỗi.
    const passwordOk = user ? await verifyPassword(password, user.password_hash) : await verifyAgainstDummy(password);
    if (!user || !passwordOk || !user.is_active) {
      recordFailure(email, ip);
      throw badRequest('invalid_credentials', INVALID_CREDENTIALS);
    }

    const t = Date.now();
    db.prepare('DELETE FROM login_attempts WHERE email = ? AND ip = ?').run(email, ip);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(t, user.id);
    user.last_login_at = t;
    return sessionPayload(user, createSession(user.id, meta));
  }

  async function changePassword(user, { oldPassword, newPassword }, currentTokenHash) {
    if (!(await verifyPassword(oldPassword, user.password_hash))) {
      throw badRequest('invalid_credentials', 'Mật khẩu hiện tại không chính xác');
    }
    assertPasswordPolicy(newPassword);
    await setPassword(user.id, newPassword, currentTokenHash);
  }

  /** Đặt mật khẩu mới và huỷ mọi phiên khác của người dùng. */
  async function setPassword(userId, newPassword, keepTokenHash = '') {
    const passwordHash = await hashPassword(newPassword);
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, Date.now(), userId);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, keepTokenHash);
    })();
  }

  // ---------- Quản trị người dùng ----------

  function listUsers({ q = '', page = 1, size = 20 }) {
    const like = `%${q.trim().toLowerCase().replace(/[%_\\]/g, '\\$&')}%`;
    const where = "WHERE email LIKE ? ESCAPE '\\' OR lower(username) LIKE ? ESCAPE '\\'";
    const total = db.prepare(`SELECT count(*) AS n FROM users ${where}`).get(like, like).n;
    const rows = db
      .prepare(`SELECT * FROM users ${where} ORDER BY id LIMIT ? OFFSET ?`)
      .all(like, like, size, (page - 1) * size);
    return { total, page, size, total_pages: Math.max(1, Math.ceil(total / size)), items: rows.map(userView) };
  }

  async function updateUser(actor, userId, patch) {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!target) throw new AppError(404, 'not_found', 'Không tìm thấy người dùng');

    const next = {
      is_staff: patch.is_staff ?? Boolean(target.is_staff),
      is_superuser: patch.is_superuser ?? Boolean(target.is_superuser),
      is_active: patch.is_active ?? Boolean(target.is_active),
    };
    const losesSuperuser = target.is_superuser && target.is_active && !(next.is_superuser && next.is_active);
    if (losesSuperuser) {
      const others = db
        .prepare('SELECT count(*) AS n FROM users WHERE is_superuser = 1 AND is_active = 1 AND id != ?')
        .get(target.id).n;
      if (others === 0) throw badRequest('last_superuser', 'Không thể hạ quyền hoặc khoá quản trị viên cuối cùng');
    }
    if (patch.password !== undefined) assertPasswordPolicy(patch.password);

    db.prepare(
      `UPDATE users SET is_staff = ?, is_superuser = ?, is_active = ?,
              nickname = coalesce(?, nickname), updated_at = ? WHERE id = ?`,
    ).run(next.is_staff ? 1 : 0, next.is_superuser ? 1 : 0, next.is_active ? 1 : 0, patch.nickname ?? null, Date.now(), target.id);

    if (patch.password !== undefined) await setPassword(target.id, patch.password);
    if (!next.is_active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    return userView(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id));
  }

  // ---------- Khởi tạo và bảo trì ----------

  /** Tạo quản trị viên đầu tiên từ biến môi trường — chỉ khi hệ thống chưa có ai. */
  async function ensureAdmin() {
    if (!config.adminEmail || !config.adminPassword) return null;
    const hasSuperuser = db.prepare('SELECT 1 FROM users WHERE is_superuser = 1 LIMIT 1').get();
    if (hasSuperuser) return null;
    const existing = findByEmail(config.adminEmail);
    if (existing) {
      db.prepare('UPDATE users SET is_superuser = 1, is_staff = 1, is_active = 1 WHERE id = ?').run(existing.id);
      return existing.email;
    }
    const user = await createUser({
      email: config.adminEmail,
      password: config.adminPassword,
      isStaff: true,
      isSuperuser: true,
      emailVerified: true,
    });
    return user.email;
  }

  function purgeExpired() {
    const t = Date.now();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(t);
    db.prepare('DELETE FROM captchas WHERE expires_at <= ?').run(t);
    db.prepare('DELETE FROM email_otps WHERE expires_at <= ?').run(t);
    db.prepare('DELETE FROM login_attempts WHERE updated_at <= ? AND locked_until <= ?').run(t - DAY_MS, t);
  }

  return {
    issueCaptcha,
    sendEmailOtp,
    register,
    login,
    logout,
    authenticate,
    changePassword,
    setPassword,
    createUser,
    findByEmail,
    listUsers,
    updateUser,
    ensureAdmin,
    purgeExpired,
  };
}

function defaultRandomDigits(length) {
  let out = '';
  for (let i = 0; i < length; i++) out += crypto.randomInt(0, 10);
  return out;
}
