-- Thiết kế của người dùng, tài liệu (nén gzip) và lịch sử phiên bản.
-- Tài liệu nằm ở bảng riêng để truy vấn danh sách không phải đọc qua BLOB lớn.

CREATE TABLE designs (
  id          TEXT    PRIMARY KEY,                  -- uuid
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  width       REAL    NOT NULL DEFAULT 0,           -- kích thước trang đầu (px)
  height      REAL    NOT NULL DEFAULT 0,
  page_count  INTEGER NOT NULL DEFAULT 1,
  thumbnail   TEXT    NOT NULL DEFAULT '',          -- đường dẫn tương đối trong thư mục media
  starred     INTEGER NOT NULL DEFAULT 0,
  revision    INTEGER NOT NULL DEFAULT 1,           -- tăng 1 mỗi lần lưu tài liệu (khoá lạc quan)
  data_bytes  INTEGER NOT NULL DEFAULT 0,           -- dung lượng tài liệu sau nén, tính vào hạn mức
  trashed_at  INTEGER,                              -- khác NULL = đang ở thùng rác
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX designs_owner_list ON designs(owner_id, trashed_at, updated_at DESC);

CREATE TABLE design_documents (
  design_id TEXT PRIMARY KEY REFERENCES designs(id) ON DELETE CASCADE,
  data      BLOB NOT NULL                           -- gzip(JSON { schema, pages, meta })
);

CREATE TABLE design_versions (
  id          TEXT    PRIMARY KEY,                  -- uuid
  design_id   TEXT    NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL DEFAULT '',
  is_auto     INTEGER NOT NULL DEFAULT 1,
  page_count  INTEGER NOT NULL DEFAULT 1,
  revision    INTEGER NOT NULL,                     -- revision của tài liệu tại thời điểm chụp
  data_bytes  INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  data        BLOB    NOT NULL                      -- để cuối: liệt kê phiên bản không chạm tới BLOB
);
CREATE INDEX design_versions_list ON design_versions(design_id, created_at DESC);
