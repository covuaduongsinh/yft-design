import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, loadEnvFile } from '../core/config.js';
import { openDb } from '../core/db.js';
import { migrate } from '../core/migrate.js';
import { createMailer } from '../auth/mailer.js';
import { createAuthService } from '../auth/service.js';

/** Mở CSDL và dựng dịch vụ xác thực cho các lệnh dòng lệnh. */
export function bootstrap() {
  loadEnvFile();
  const config = loadConfig();
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = openDb(config.dbFile);
  migrate(db, path.join(config.serverRoot, 'migrations'));
  const auth = createAuthService({ db, config, mailer: createMailer(config) });
  return { config, db, auth };
}
