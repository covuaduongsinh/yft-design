import { Hono } from 'hono';
import { z } from 'zod';
import { badRequest, ok, readJson } from '../core/http.js';

const pageOf = (c) => {
  const page = Number(c.req.query('page') || 1);
  return Number.isInteger(page) && page >= 1 && page <= 50 ? page : 1;
};

/**
 * Kho ảnh. Bốn endpoint GET giữ đúng đường dẫn và dạng trả về (mảng phẳng) mà frontend vốn dùng:
 * /api/design/image/{page,category} và /api/design/illustration/{page,category}.
 */
export function stockListRoutes({ stock }, kind) {
  const app = new Hono();
  const handler = async (c) => ok(c, await stock.list(kind, String(c.req.query('t') || ''), pageOf(c)));
  app.get('/page', handler);
  app.get('/category', handler);
  return app;
}

/** Quản lý kho ảnh và nhập ảnh ngoài, gắn dưới /api/design/stock. */
export function stockRoutes({ stock, guard, limiters }) {
  const app = new Hono();

  app.post('/import', guard.requireUser, async (c) => {
    limiters.upload.hit(`upload:${c.get('user').id}`);
    const body = await readJson(c, z.object({ url: z.string().min(1).max(2000) }));
    return ok(c, await stock.importRemote(c.get('user').id, body.url), 'Đã nhập ảnh');
  });

  app.post('/', guard.requireStaff, async (c) => {
    let form;
    try {
      form = await c.req.formData();
    } catch {
      throw badRequest('invalid_input', 'Yêu cầu phải ở dạng multipart/form-data');
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw badRequest('invalid_input', 'Thiếu trường "file"');
    const text = (name) => (typeof form.get(name) === 'string' ? form.get(name) : '');
    const item = await stock.add(c.get('user').id, Buffer.from(await file.arrayBuffer()), {
      kind: text('kind'),
      category: text('category'),
      tags: text('tags'),
    });
    return ok(c, item, 'Đã thêm vào kho ảnh');
  });

  app.delete('/:id', guard.requireStaff, async (c) => {
    await stock.remove(c.req.param('id'));
    return ok(c, null, 'Đã xoá khỏi kho ảnh');
  });

  return app;
}
