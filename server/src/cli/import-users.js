// Nhập một lần danh sách người dùng của server giả lập cũ (mật khẩu văn bản thuần)
// vào CSDL mới, băm lại mật khẩu bằng scrypt:
//   pnpm import-users [đường-dẫn-users.json]
// Email đã có trong CSDL được bỏ qua. Sau khi nhập xong hãy xoá file nguồn.
import fs from 'node:fs';
import path from 'node:path';
import { normalizeEmail } from '../auth/service.js';
import { bootstrap } from './bootstrap.js';

const { config, db, auth } = bootstrap();
const file = path.resolve(process.argv[2] || path.join(config.serverRoot, 'data', 'users.json'));

if (!fs.existsSync(file)) {
  console.error(`Không tìm thấy file: ${file}`);
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(file, 'utf8'));
let imported = 0;
let skipped = 0;

for (const user of users) {
  const email = normalizeEmail(user.email);
  if (!email || typeof user.password !== 'string' || !user.password) {
    skipped += 1;
    continue;
  }
  if (auth.findByEmail(email)) {
    skipped += 1;
    continue;
  }
  await auth.createUser({
    email,
    password: user.password,
    username: user.username,
    isStaff: Boolean(user.is_staff),
    isSuperuser: Boolean(user.is_superuser),
  });
  imported += 1;
  console.log(`  + ${email}${user.is_superuser ? ' (superuser)' : user.is_staff ? ' (staff)' : ''}`);
}

console.log(`Đã nhập ${imported} tài khoản, bỏ qua ${skipped}.`);
console.log('Các mật khẩu này từng được lưu ở dạng văn bản thuần: hãy xoá file nguồn và yêu cầu người dùng đổi mật khẩu.');
db.close();
