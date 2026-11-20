-- Template do staff đăng và font do staff tải lên: dùng chung cho mọi người dùng.

CREATE TABLE templates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,   -- số, vì frontend mở template bằng ?template=<số>
  title        TEXT    NOT NULL,
  text         TEXT    NOT NULL DEFAULT '',         -- mô tả ngắn hiện dưới ảnh xem trước
  category     TEXT    NOT NULL DEFAULT '',
  width        REAL    NOT NULL DEFAULT 0,
  height       REAL    NOT NULL DEFAULT 0,
  page_count   INTEGER NOT NULL DEFAULT 1,
  preview      TEXT    NOT NULL DEFAULT '',         -- đường dẫn tương đối trong thư mục media
  is_published INTEGER NOT NULL DEFAULT 1,
  use_count    INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  data         BLOB    NOT NULL                     -- gzip(JSON { schema, pages, meta }), để cuối
);
CREATE INDEX templates_list ON templates(is_published, created_at DESC);

-- Ảnh của template là bản sao riêng, không phụ thuộc ảnh trong tài khoản người đăng.
CREATE TABLE template_files (
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  path        TEXT    NOT NULL,
  PRIMARY KEY (template_id, path)
);

CREATE TABLE fonts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  fontname   TEXT    NOT NULL UNIQUE,               -- tên dùng làm font-family
  file       TEXT    NOT NULL,                      -- đường dẫn tương đối trong thư mục media
  format     TEXT    NOT NULL,                      -- truetype | opentype | woff | woff2
  size       INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
