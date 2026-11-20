// Nạp một template từ file JSON đã xuất bằng "Tải xuống → JSON" của trình chỉnh sửa:
//   pnpm import-template <file.json> "<tên mẫu>" ["<mô tả>"]
// Ảnh nhúng (data URL) được giữ nguyên trong tài liệu. Ảnh xem trước cần đăng lại từ giao diện
// (mở mẫu trong trình chỉnh sửa rồi bấm "Đăng mẫu") nếu muốn có.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createMediaStore } from '../core/media.js';
import { createTemplateService } from '../templates/service.js';
import { bootstrap } from './bootstrap.js';

const [file, title, text = ''] = process.argv.slice(2);
if (!file || !title) {
  console.error('Cách dùng: pnpm import-template <file.json> "<tên mẫu>" ["<mô tả>"]');
  process.exit(1);
}

const { config, db } = bootstrap();
const templates = createTemplateService({ db, config, media: createMediaStore(config.mediaDir) });

const raw = fs.readFileSync(path.resolve(file), 'utf8');
JSON.parse(raw); // báo lỗi sớm nếu file không phải JSON
const data = zlib.gzipSync(Buffer.from(raw, 'utf8')).toString('base64');

const template = await templates.create(null, { title, text, data });
console.log(`Đã nạp mẫu #${template.id} "${template.title}" (${template.page_count} trang, ${template.width}x${template.height}px).`);
db.close();
