// Tạo (hoặc nâng quyền) một quản trị viên:
//   pnpm create-admin <email> <mật khẩu>
// Nếu email đã tồn tại thì chỉ nâng quyền; thêm --reset-password để đặt lại mật khẩu.
import { normalizeEmail } from '../auth/service.js';
import { bootstrap } from './bootstrap.js';

const args = process.argv.slice(2);
const resetPassword = args.includes('--reset-password');
const [rawEmail, password] = args.filter((arg) => !arg.startsWith('--'));

if (!rawEmail || !password) {
  console.error('Cách dùng: pnpm create-admin <email> <mật khẩu> [--reset-password]');
  process.exit(1);
}

const { config, db, auth } = bootstrap();
const email = normalizeEmail(rawEmail);

if (password.length < config.passwordMinLength) {
  console.error(`Mật khẩu phải có ít nhất ${config.passwordMinLength} ký tự`);
  process.exit(1);
}

const existing = auth.findByEmail(email);
if (existing) {
  db.prepare('UPDATE users SET is_staff = 1, is_superuser = 1, is_active = 1, updated_at = ? WHERE id = ?').run(
    Date.now(),
    existing.id,
  );
  if (resetPassword) await auth.setPassword(existing.id, password);
  console.log(`Đã nâng ${email} thành quản trị viên${resetPassword ? ' và đặt lại mật khẩu' : ' (mật khẩu giữ nguyên)'}.`);
} else {
  await auth.createUser({ email, password, isStaff: true, isSuperuser: true, emailVerified: true });
  console.log(`Đã tạo quản trị viên ${email}.`);
}
db.close();
