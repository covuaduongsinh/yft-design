import { Hono } from 'hono';
import { badRequest, ok } from '../core/http.js';

/** Font dùng chung, gắn dưới /api/design/font. Ai cũng đọc được danh sách; chỉ staff thêm/xoá. */
export function fontRoutes({ fonts, guard }) {
  const app = new Hono();

  app.get('/info', (c) => ok(c, fonts.list()));

  app.post('/', guard.requireStaff, async (c) => {
    let form;
    try {
      form = await c.req.formData();
    } catch {
      throw badRequest('invalid_input', 'Yêu cầu phải ở dạng multipart/form-data');
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw badRequest('invalid_input', 'Thiếu trường "file"');
    const fontname = typeof form.get('fontname') === 'string' ? form.get('fontname') : '';
    const buffer = Buffer.from(await file.arrayBuffer());
    return ok(c, await fonts.upload(c.get('user').id, buffer, fontname), 'Đã thêm font');
  });

  app.delete('/:id', guard.requireStaff, async (c) => {
    await fonts.remove(c.req.param('id'));
    return ok(c, null, 'Đã xoá font');
  });

  return app;
}
