import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Mở CSDL SQLite. Toàn bộ mã nguồn chỉ dùng `prepare/exec/transaction/pragma`
 * của đối tượng trả về, nên muốn đổi driver chỉ cần sửa file này.
 * @param {string} file đường dẫn file hoặc ':memory:'
 */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);

  // auto_vacuum chỉ có hiệu lực nếu đặt trước khi tạo bảng đầu tiên.
  db.pragma('auto_vacuum = INCREMENTAL');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_size_limit = 67108864');
  return db;
}

/** Thời điểm hiện tại, tính bằng mili giây kể từ epoch. */
export const now = () => Date.now();

/** Chuyển mili giây sang chuỗi 'YYYY-MM-DD HH:mm:ss' (UTC) mà frontend đang hiển thị. */
export function formatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}
