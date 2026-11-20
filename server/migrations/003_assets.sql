-- Ảnh người dùng tải lên, và bảng ghi nhận thiết kế/phiên bản nào đang dùng ảnh nào.

CREATE TABLE assets (
  id             TEXT    PRIMARY KEY,               -- 32 ký tự hex ngẫu nhiên, cũng là tên file
  owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sha256         TEXT    NOT NULL,                  -- của file GỐC người dùng gửi lên (khoá khử trùng)
  name           TEXT    NOT NULL DEFAULT '',
  mime           TEXT    NOT NULL,
  ext            TEXT    NOT NULL,
  width          INTEGER NOT NULL DEFAULT 0,
  height         INTEGER NOT NULL DEFAULT 0,
  size           INTEGER NOT NULL,                  -- dung lượng file đã lưu
  thumbnail_size INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  UNIQUE (owner_id, sha256)
);
CREATE INDEX assets_owner_list ON assets(owner_id, created_at DESC);

-- Tài liệu hiện tại của một thiết kế đang tham chiếu những ảnh nào.
CREATE TABLE design_asset_refs (
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  asset_id  TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (design_id, asset_id)
);
CREATE INDEX design_asset_refs_asset ON design_asset_refs(asset_id);

-- Một phiên bản đã chụp đang tham chiếu những ảnh nào.
CREATE TABLE version_asset_refs (
  version_id TEXT NOT NULL REFERENCES design_versions(id) ON DELETE CASCADE,
  asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (version_id, asset_id)
);
CREATE INDEX version_asset_refs_asset ON version_asset_refs(asset_id);
