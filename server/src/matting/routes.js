import { z } from 'zod';
import { badRequest, readJson } from '../core/http.js';

/**
 * Hai endpoint tách nền giữ đúng đường dẫn và dạng trả về mà frontend vốn dùng:
 * `{ code, resultImage }` ở cấp ngoài cùng (không bọc trong `data`).
 */
export function registerMattingRoutes(app, { matting, guard, limiters }) {
  const reply = (c, result) =>
    c.json({ code: 200, msg: 'success', resultImage: result.url, size: { width: result.width, height: result.height } });

  app.post('/api/design/matting/file', guard.requireUser, async (c) => {
    limiters.upload.hit(`upload:${c.get('user').id}`);
    let form;
    try {
      form = await c.req.formData();
    } catch {
      throw badRequest('invalid_input', 'Yêu cầu phải ở dạng multipart/form-data');
    }
    const image = form.get('image');
    if (!image || typeof image === 'string') throw badRequest('invalid_input', 'Thiếu trường "image"');
    return reply(c, await matting.fromBuffer(c.get('user').id, Buffer.from(await image.arrayBuffer())));
  });

  app.post('/api/matting/url', guard.requireUser, async (c) => {
    limiters.upload.hit(`upload:${c.get('user').id}`);
    const body = await readJson(c, z.object({ image: z.string().min(1) }));
    return reply(c, await matting.fromSource(c.get('user').id, body.image));
  });
}
