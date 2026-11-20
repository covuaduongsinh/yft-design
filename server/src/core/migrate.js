import fs from 'node:fs';
import path from 'node:path';

/**
 * Chạy các file `NNN_ten.sql` trong thư mục migrations theo thứ tự số,
 * mỗi file trong một transaction, và ghi lại file nào đã chạy.
 * @returns {string[]} tên các migration vừa được áp dụng
 */
export function migrate(db, migrationsDir) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const ran = [];
  for (const name of files) {
    const version = parseInt(name, 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        version,
        name,
        Date.now(),
      );
    })();
    ran.push(name);
  }
  return ran;
}
