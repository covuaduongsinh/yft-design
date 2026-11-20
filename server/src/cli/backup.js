// Tạo ngay một bản sao lưu CSDL vào DATA_DIR/backups (chạy được cả khi server đang hoạt động):
//   pnpm backup
// Khôi phục: dừng server, chép file sao lưu đè lên DATA_DIR/yft.db (xoá yft.db-wal, yft.db-shm nếu có), rồi chạy lại.
import { createBackup } from '../core/backup.js';
import { bootstrap } from './bootstrap.js';

const { config, db } = bootstrap();
const file = await createBackup({ db, config }).run();
console.log(`Đã sao lưu CSDL vào ${file}`);
db.close();
