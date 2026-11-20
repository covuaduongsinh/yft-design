import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './core/config.js';
import { openDb } from './core/db.js';
import { migrate } from './core/migrate.js';

loadEnvFile();
const config = loadConfig();

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.mediaDir, { recursive: true });

const db = openDb(config.dbFile);
const ran = migrate(db, path.join(config.serverRoot, 'migrations'));
if (ran.length) console.log(`[DB] Đã áp dụng migration: ${ran.join(', ')}`);

const { app, ctx, close } = createApp({ config, db });

const adminEmail = await ctx.auth.ensureAdmin();
if (adminEmail) console.log(`[AUTH] Đã tạo/nâng quyền quản trị viên đầu tiên: ${adminEmail}`);

ctx.auth.purgeExpired();
const maintenance = setInterval(() => {
  try {
    ctx.auth.purgeExpired();
    for (const task of ctx.maintenance ?? []) task();
  } catch (err) {
    console.error('[BẢO TRÌ] Lỗi tác vụ định kỳ:', err);
  }
}, 10 * 60_000);
maintenance.unref();

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log('====================================================');
  console.log(`yft-design server đang chạy tại http://${info.address}:${info.port}`);
  console.log(`  CSDL:        ${config.dbFile}`);
  console.log(`  Media:       ${config.mediaDir}`);
  console.log(`  Phục vụ SPA: ${config.staticDir && fs.existsSync(config.staticDir) ? config.staticDir : 'không (dùng Vite dev)'}`);
  console.log('====================================================');
});

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[${signal}] Đang dừng server...`);
  clearInterval(maintenance);
  close();
  server.close(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } finally {
      process.exit(0);
    }
  });
  // Không để kết nối treo giữ tiến trình quá lâu.
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
