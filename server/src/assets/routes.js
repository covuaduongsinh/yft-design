import { Hono } from 'hono';
import { z } from 'zod';
import { badRequest, ok, parse, tooLarge } from '../core/http.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  size: z.coerce.number().int().min(1).max(100).optional().default(30),
});

/** Ảnh tải lên, gắn dưới /api/design/assets — mọi endpoint đều cần đăng nhập. */
export function assetRoutes({ assets, guard, limiters, config }) {
  const app = new Hono();
  app.use('*', guard.requireUser);
  const userId = (c) => c.get('user').id;

  app.get('/', (c) => ok(c, assets.list(userId(c), parse(listQuery, c.req.query()))));

  app.get('/usage', (c) => ok(c, assets.usage(userId(c))));

  app.post('/', async (c) => {
    limiters.upload.hit(`upload:${userId(c)}`);
    let form;
    try {
      form = await c.req.formData();
    } catch {
      throw badRequest('invalid_input', 'Yêu cầu phải ở dạng multipart/form-data');
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw badRequest('invalid_input', 'Thiếu trường "file"');
    if (file.size > config.maxUploadBytes) {
      throw tooLarge(`Ảnh vượt quá ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = typeof form.get('name') === 'string' ? form.get('name') : file.name;
    return ok(c, await assets.upload(userId(c), buffer, name), 'Đã tải ảnh lên');
  });

  app.delete('/:id', async (c) => {
    await assets.remove(userId(c), c.req.param('id'));
    return ok(c, null, 'Đã xoá ảnh');
  });

  return app;
}
