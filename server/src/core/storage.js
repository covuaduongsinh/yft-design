/**
 * Dung lượng một người dùng đang chiếm: tài liệu thiết kế, các phiên bản và ảnh tải lên.
 * Mọi nơi ghi dữ liệu của người dùng đều so con số này với USER_STORAGE_QUOTA_BYTES.
 */
export function createStorageMeter(db) {
  const tableExists = (name) =>
    Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

  const designBytes = db.prepare('SELECT coalesce(sum(data_bytes), 0) AS n FROM designs WHERE owner_id = ?');
  const versionBytes = db.prepare(
    `SELECT coalesce(sum(v.data_bytes), 0) AS n FROM design_versions v
     JOIN designs d ON d.id = v.design_id WHERE d.owner_id = ?`,
  );
  const assetBytes = tableExists('assets')
    ? db.prepare('SELECT coalesce(sum(size + thumbnail_size), 0) AS n FROM assets WHERE owner_id = ?')
    : null;

  return {
    used(userId) {
      return designBytes.get(userId).n + versionBytes.get(userId).n + (assetBytes ? assetBytes.get(userId).n : 0);
    },
  };
}
