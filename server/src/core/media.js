import fs from 'node:fs';
import path from 'node:path';
import { resolveInside, sendFile } from './static.js';

/**
 * Kho file do người dùng tạo ra (thumbnail, ảnh tải lên, font...).
 *
 * File được phục vụ ở /media/... cùng origin với ứng dụng, trong khi token đăng
 * nhập nằm ở localStorage — nên không file nào ở đây được phép chạy script:
 *  - CSP `sandbox` biến mọi file mở trực tiếp thành origin rỗng, không đọc được localStorage;
 *  - `nosniff` cấm trình duyệt đoán lại kiểu nội dung.
 * Đường dẫn chứa định danh ngẫu nhiên 128 bit, không chứa id người dùng: biết URL mới xem được.
 */
export function createMediaStore(mediaDir) {
  fs.mkdirSync(mediaDir, { recursive: true });

  const absolute = (relative) => {
    const file = resolveInside(mediaDir, relative);
    if (!file) throw new Error(`Đường dẫn media không hợp lệ: ${relative}`);
    return file;
  };

  return {
    dir: mediaDir,

    /** Địa chỉ công khai của một file media, hoặc '' nếu chưa có. */
    url: (relative) => (relative ? `/media/${relative}` : ''),

    async write(relative, buffer) {
      const file = absolute(relative);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      // Ghi ra file tạm rồi đổi tên để không bao giờ có file dở dang ở đường dẫn thật.
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(temp, buffer);
      await fs.promises.rename(temp, file);
    },

    async copy(fromRelative, toRelative) {
      const target = absolute(toRelative);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(absolute(fromRelative), target);
    },

    /** Xoá file nếu có; không báo lỗi khi file đã mất. */
    async remove(relative) {
      if (!relative) return;
      try {
        await fs.promises.unlink(absolute(relative));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('[MEDIA] Không xoá được file', relative, err.message);
      }
    },

    exists(relative) {
      const file = resolveInside(mediaDir, relative);
      return Boolean(file) && fs.existsSync(file);
    },

    /** Handler cho GET/HEAD /media/* */
    handler: async (c) => {
      const relative = new URL(c.req.url).pathname.replace(/^\/media\//, '');
      const file = resolveInside(mediaDir, relative);
      const response = file
        ? await sendFile(c, file, {
            // Tên file là định danh ngẫu nhiên, nội dung không bao giờ đổi.
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
            'Cross-Origin-Resource-Policy': 'same-origin',
          })
        : null;
      return response ?? c.json({ code: 404, error: 'not_found', msg: 'Không tìm thấy file', data: null }, 404);
    },
  };
}
