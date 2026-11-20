-- Người dùng, phiên đăng nhập, captcha, mã OTP email và bộ đếm đăng nhập sai.
-- Mọi mốc thời gian là mili giây kể từ epoch (UTC).

CREATE TABLE users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid             TEXT    NOT NULL UNIQUE,
  email            TEXT    NOT NULL UNIQUE,          -- luôn lưu chữ thường
  username         TEXT    NOT NULL,
  nickname         TEXT    NOT NULL DEFAULT '',
  phone            TEXT    NOT NULL DEFAULT '',
  avatar           TEXT    NOT NULL DEFAULT '',
  password_hash    TEXT    NOT NULL,
  is_staff         INTEGER NOT NULL DEFAULT 0,
  is_superuser     INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  email_verified   INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  last_login_at    INTEGER
);

-- Chỉ lưu SHA-256 của token; token gốc chỉ nằm ở trình duyệt.
CREATE TABLE sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  ip           TEXT    NOT NULL DEFAULT '',
  user_agent   TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE captchas (
  id         TEXT    PRIMARY KEY,
  code_hash  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX captchas_expires ON captchas(expires_at);

CREATE TABLE email_otps (
  email      TEXT    PRIMARY KEY,
  code_hash  TEXT    NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_at    INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Khoá theo cặp email + IP để kẻ tấn công không khoá được nạn nhân từ máy khác.
CREATE TABLE login_attempts (
  email        TEXT    NOT NULL,
  ip           TEXT    NOT NULL,
  failures     INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (email, ip)
);
