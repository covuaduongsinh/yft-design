import fs from 'node:fs';
import { AppError, badRequest, tooLarge } from '../core/http.js';
import { resolveInside } from '../core/static.js';

/**
 * Tách nền ảnh bằng một dịch vụ rembg chạy riêng (xem docs/backend). Mặc định tắt:
 * chỉ hoạt động khi đặt MATTING_URL. Dịch vụ đó nặng và không có xác thực, nên server
 * này là nơi duy nhất được gọi tới nó, và chỉ gửi đi ảnh do chính người dùng cung cấp.
 *
 * @param {{ config: object, media: ReturnType<import('../core/media.js').createMediaStore>,
 *           assets: ReturnType<import('../assets/service.js').createAssetService>,
 *           fetchImpl?: typeof fetch }} deps
 */
export function createMattingService({ config, media, assets, fetchImpl = fetch }) {
  // Mô hình tách nền ngốn nhiều RAM: xử lý lần lượt từng ảnh một.
  let queue = Promise.resolve();
  const enqueue = (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  /**
   * Lấy dữ liệu ảnh từ chuỗi client gửi. Chỉ nhận ảnh nhúng (data URL) hoặc ảnh đang nằm trong
   * kho /media của máy chủ này — tuyệt đối không tải một URL bất kỳ, để endpoint này không
   * thành công cụ dò mạng nội bộ (SSRF).
   */
  async function readSource(source) {
    const value = String(source || '');
    const dataUrl = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/is.exec(value);
    if (dataUrl) return Buffer.from(dataUrl[1], 'base64');

    let pathname = '';
    try {
      pathname = new URL(value, 'http://localhost').pathname;
    } catch {
      pathname = '';
    }
    if (pathname.startsWith('/media/')) {
      const file = resolveInside(media.dir, pathname.slice('/media/'.length));
      if (file && fs.existsSync(file)) return fs.promises.readFile(file);
    }
    throw badRequest('invalid_input', 'Chỉ tách nền được ảnh nhúng trong thiết kế hoặc ảnh đã lưu trên máy chủ. Hãy lưu thiết kế rồi thử lại.');
  }

  async function removeBackground(userId, buffer) {
    if (!config.mattingUrl) throw badRequest('matting_disabled', 'Máy chủ chưa bật tính năng tách nền');
    if (buffer.length === 0) throw badRequest('invalid_image', 'File rỗng');
    if (buffer.length > config.maxUploadBytes) {
      throw tooLarge(`Ảnh vượt quá ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB`);
    }

    const result = await enqueue(async () => {
      const form = new FormData();
      form.append('file', new Blob([buffer]), 'image');
      let response;
      try {
        response = await fetchImpl(`${config.mattingUrl}/api/remove`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(config.mattingTimeoutSeconds * 1000),
        });
      } catch {
        throw new AppError(503, 'matting_unavailable', 'Dịch vụ tách nền đang bận hoặc không phản hồi, vui lòng thử lại sau');
      }
      if (!response.ok) {
        throw new AppError(503, 'matting_unavailable', 'Dịch vụ tách nền không xử lý được ảnh này');
      }
      return Buffer.from(await response.arrayBuffer());
    });

    // Kết quả đi qua đúng quy trình ảnh tải lên (kiểm tra là ảnh thật, tính hạn mức).
    const asset = await assets.upload(userId, result, 'tach-nen.png');
    return { url: asset.url, width: asset.width, height: asset.height };
  }

  return {
    enabled: Boolean(config.mattingUrl),
    fromBuffer: removeBackground,
    fromSource: async (userId, source) => removeBackground(userId, await readSource(source)),
  };
}
