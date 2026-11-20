-- Kho ảnh/minh hoạ dùng chung do staff đăng, và bộ nhớ đệm kết quả tìm kiếm Pixabay.

CREATE TABLE stock_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT    NOT NULL CHECK (kind IN ('image', 'illustration')),
  category     TEXT    NOT NULL,                    -- mã danh mục của frontend: backgrounds, nature, ...
  tags         TEXT    NOT NULL DEFAULT '',
  file         TEXT    NOT NULL,                    -- đường dẫn tương đối trong thư mục media
  thumbnail    TEXT    NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  thumb_width  INTEGER NOT NULL,
  thumb_height INTEGER NOT NULL,
  size         INTEGER NOT NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX stock_items_list ON stock_items(kind, category, created_at DESC);

CREATE TABLE stock_cache (
  key        TEXT    PRIMARY KEY,
  body       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);
