import fs from 'node:fs';
import path from 'node:path';

const DAY_MS = 24 * 60 * 60_000;
const NAME = /^yft-\d{8}-\d{4}\.db$/;

/**
 * Sao lưu CSDL sang DATA_DIR/backups bằng API sao lưu trực tuyến của SQLite: bản sao luôn
 * nhất quán dù server đang ghi (chép thẳng file .db lúc đang chạy thì không bảo đảm điều đó).
 * Chỉ sao lưu CSDL; ảnh trong DATA_DIR/media cần được sao lưu cùng volume.
 */
export function createBackup({ db, config }) {
  const list = () => {
    if (!fs.existsSync(config.backupDir)) return [];
    return fs
      .readdirSync(config.backupDir)
      .filter((name) => NAME.test(name))
      .map((name) => ({ name, file: path.join(config.backupDir, name), mtime: fs.statSync(path.join(config.backupDir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  };

  /** Tạo một bản sao lưu ngay và xoá các bản quá hạn giữ. Trả về đường dẫn file vừa tạo. */
  async function run() {
    fs.mkdirSync(config.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
    const file = path.join(config.backupDir, `yft-${stamp}.db`);
    await db.backup(file);
    const cutoff = Date.now() - config.backupKeepDays * DAY_MS;
    for (const old of list()) {
      if (old.file !== file && old.mtime < cutoff) fs.unlinkSync(old.file);
    }
    return file;
  }

  /** Dùng trong tác vụ định kỳ: mỗi ngày một bản, chỉ khi BACKUP_ENABLED=true. */
  async function runIfDue() {
    if (!config.backupEnabled) return null;
    const newest = list()[0];
    if (newest && Date.now() - newest.mtime < DAY_MS) return null;
    const file = await run();
    console.log(`[SAO LƯU] Đã tạo ${file}`);
    return file;
  }

  return { run, runIfDue, list };
}
