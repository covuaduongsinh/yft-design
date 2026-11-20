import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MiB = 1024 * 1024;

function str(env, key, fallback = '') {
  const value = env[key];
  return value === undefined || value === '' ? fallback : String(value).trim();
}

function int(env, key, fallback) {
  const raw = str(env, key);
  if (raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Biến môi trường ${key} phải là số không âm, đang là "${raw}"`);
  }
  return Math.floor(value);
}

function bool(env, key, fallback) {
  const raw = str(env, key).toLowerCase();
  if (raw === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`Biến môi trường ${key} phải là true/false, đang là "${raw}"`);
}

/**
 * Nạp file .env cạnh package server (nếu có) vào process.env.
 * Biến đã có sẵn trong môi trường luôn được ưu tiên.
 */
export function loadEnvFile() {
  const file = path.join(SERVER_ROOT, '.env');
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

/**
 * Mọi thiết lập đều có giá trị mặc định an toàn; tính năng gọi dịch vụ
 * ngoài (SMTP, Pixabay, tách nền) chỉ bật khi biến tương ứng được đặt.
 * @param {Record<string, string | undefined>} env
 */
export function loadConfig(env = process.env) {
  const dataDir = path.resolve(SERVER_ROOT, str(env, 'DATA_DIR', 'data'));
  const staticDir = str(env, 'STATIC_DIR');

  const config = {
    serverRoot: SERVER_ROOT,
    env: str(env, 'NODE_ENV', 'development'),
    host: str(env, 'HOST', '127.0.0.1'),
    port: int(env, 'PORT', 8788),
    siteUrl: str(env, 'SITE_URL', 'http://localhost:5174').replace(/\/+$/, ''),

    dataDir,
    dbFile: str(env, 'DB_FILE') || path.join(dataDir, 'yft.db'),
    mediaDir: path.join(dataDir, 'media'),
    backupDir: path.join(dataDir, 'backups'),
    staticDir: staticDir ? path.resolve(SERVER_ROOT, staticDir) : '',

    // Số proxy tin cậy đứng trước server (Traefik của Dokploy = 1).
    trustProxyHops: int(env, 'TRUST_PROXY_HOPS', 0),

    sessionTtlDays: int(env, 'SESSION_TTL_DAYS', 30),
    registrationOpen: bool(env, 'REGISTRATION_OPEN', true),
    captchaEnabled: bool(env, 'CAPTCHA_ENABLED', true),
    requireEmailOtp: bool(env, 'REQUIRE_EMAIL_OTP', false),
    passwordMinLength: int(env, 'PASSWORD_MIN_LENGTH', 8),
    loginMaxFailures: int(env, 'LOGIN_MAX_FAILURES', 5),
    loginLockMinutes: int(env, 'LOGIN_LOCK_MINUTES', 15),
    authRatePerMinute: int(env, 'AUTH_RATE_PER_MINUTE', 30),

    smtpUrl: str(env, 'SMTP_URL'),
    mailFrom: str(env, 'MAIL_FROM', 'yft-design <no-reply@localhost>'),

    adminEmail: str(env, 'ADMIN_EMAIL').toLowerCase(),
    adminPassword: str(env, 'ADMIN_PASSWORD'),

    maxUploadBytes: int(env, 'MAX_UPLOAD_BYTES', 20 * MiB),
    maxImagePixels: int(env, 'MAX_IMAGE_PIXELS', 64_000_000),
    userStorageQuotaBytes: int(env, 'USER_STORAGE_QUOTA_BYTES', 1024 * MiB),
    uploadRatePerMinute: int(env, 'UPLOAD_RATE_PER_MINUTE', 120),

    maxDesignDocumentBytes: int(env, 'MAX_DESIGN_DOCUMENT_BYTES', 20 * MiB),
    maxDesignsPerUser: int(env, 'MAX_DESIGNS_PER_USER', 500),
    trashRetentionDays: int(env, 'TRASH_RETENTION_DAYS', 30),
    autoVersionIntervalMinutes: int(env, 'AUTO_VERSION_INTERVAL_MINUTES', 10),
    maxAutoVersions: int(env, 'MAX_AUTO_VERSIONS', 50),
    maxManualVersions: int(env, 'MAX_MANUAL_VERSIONS', 100),

    maxFontBytes: int(env, 'MAX_FONT_BYTES', 15 * MiB),

    pixabayApiKey: str(env, 'PIXABAY_API_KEY'),
    mattingUrl: str(env, 'MATTING_URL').replace(/\/+$/, ''),
    mattingTimeoutSeconds: int(env, 'MATTING_TIMEOUT_SECONDS', 120),

    backupKeepDays: int(env, 'BACKUP_KEEP_DAYS', 7),
    backupEnabled: bool(env, 'BACKUP_ENABLED', false),
  };

  if (config.requireEmailOtp && !config.smtpUrl) {
    throw new Error('REQUIRE_EMAIL_OTP=true cần cấu hình SMTP_URL để gửi được mã xác thực');
  }
  if (config.adminPassword && config.adminPassword.length < config.passwordMinLength) {
    throw new Error(`ADMIN_PASSWORD phải dài tối thiểu ${config.passwordMinLength} ký tự`);
  }
  return config;
}

/** Thông tin an toàn để lộ cho frontend qua GET /api/design/config. */
export function publicConfig(config) {
  return {
    registration_open: config.registrationOpen,
    captcha_enabled: config.captchaEnabled,
    email_otp_required: config.requireEmailOtp,
    password_min_length: config.passwordMinLength,
    max_upload_bytes: config.maxUploadBytes,
    max_design_document_bytes: config.maxDesignDocumentBytes,
    features: {
      stock_pixabay: Boolean(config.pixabayApiKey),
      matting: Boolean(config.mattingUrl),
    },
  };
}
