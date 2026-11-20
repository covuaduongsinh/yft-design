import { Hono } from 'hono';
import { z } from 'zod';
import { badRequest, ok, parse, readJson } from '../core/http.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  size: z.coerce.number().int().min(1).max(100).optional().default(20),
  q: z.string().max(100).optional().default(''),
  all: z.string().optional(),
});

const createBody = z.object({
  title: z.string().max(200).optional(),
  text: z.string().max(500).optional(),
  category: z.string().max(60).optional(),
  is_published: z.boolean().optional(),
  data: z.string().min(1),
});

const updateBody = z
  .object({
    title: z.string().max(200).optional(),
    text: z.string().max(500).optional(),
    category: z.string().max(60).optional(),
    is_published: z.boolean().optional(),
  })
  .strict();

/**
 * Template, gắn dưới /api/design/template. Ba endpoint GET giữ đúng đường dẫn và dạng
 * trả về mà frontend vốn dùng; phần quản lý chỉ dành cho staff.
 */
export function templateRoutes({ templates, guard }) {
  const app = new Hono();
  const isStaff = (c) => Boolean(c.get('user') && (c.get('user').is_staff || c.get('user').is_superuser));

  const listHandler = (c) => {
    const query = parse(listQuery, c.req.query());
    // Staff thêm ?all=1 để thấy cả template đang ẩn.
    return ok(c, templates.list({ ...query, includeUnpublished: query.all === '1' && isStaff(c) }));
  };
  app.get('/info/pages', guard.optionalUser, listHandler);
  app.get('/detail/pages', guard.optionalUser, listHandler);

  app.get('/data/:id', guard.optionalUser, (c) =>
    ok(c, templates.getData(c.req.param('id'), { includeUnpublished: isStaff(c) })),
  );

  app.post('/', guard.requireStaff, async (c) => {
    const body = await readJson(c, createBody);
    return ok(c, await templates.create(c.get('user').id, body), 'Đã đăng mẫu');
  });

  app.patch('/:id', guard.requireStaff, async (c) => {
    const body = await readJson(c, updateBody);
    return ok(c, templates.update(c.req.param('id'), body), 'Đã cập nhật mẫu');
  });

  app.put('/:id/preview', guard.requireStaff, async (c) => {
    let form;
    try {
      form = await c.req.formData();
    } catch {
      throw badRequest('invalid_input', 'Yêu cầu phải ở dạng multipart/form-data');
    }
    const image = form.get('image');
    if (!image || typeof image === 'string') throw badRequest('invalid_input', 'Thiếu trường "image"');
    return ok(c, await templates.setPreview(c.req.param('id'), Buffer.from(await image.arrayBuffer())));
  });

  app.delete('/:id', guard.requireStaff, async (c) => {
    await templates.remove(c.req.param('id'));
    return ok(c, null, 'Đã xoá mẫu');
  });

  return app;
}
