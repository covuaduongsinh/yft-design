import { Hono } from 'hono';
import { z } from 'zod';
import { badRequest, ok, parse, readJson, tooLarge } from '../core/http.js';

const flag = z.enum(['0', '1', 'true', 'false']).transform((value) => value === '1' || value === 'true');

const listQuery = z.object({
  q: z.string().max(100).optional().default(''),
  starred: flag.optional(),
  trashed: flag.optional().default(false),
  page: z.coerce.number().int().min(1).optional().default(1),
  size: z.coerce.number().int().min(1).max(100).optional().default(20),
  ordering: z.enum(['updated_at', '-updated_at', 'created_at', '-created_at', 'title', '-title']).optional().default('-updated_at'),
});

const createBody = z.object({
  title: z.string().max(200).optional(),
  data: z.string().min(1),
});

const updateBody = z
  .object({
    title: z.string().max(200).optional(),
    starred: z.boolean().optional(),
    data: z.string().min(1).optional(),
    base_revision: z.number().int().optional(),
  })
  .strict();

const versionBody = z.object({ label: z.string().max(120).optional() });

/** Thiết kế của tôi, gắn dưới /api/design/designs — mọi endpoint đều cần đăng nhập. */
export function designRoutes({ designs, guard }) {
  const app = new Hono();
  app.use('*', guard.requireUser);
  const userId = (c) => c.get('user').id;

  app.get('/', (c) => ok(c, designs.list(userId(c), parse(listQuery, c.req.query()))));

  app.post('/', async (c) => {
    const body = await readJson(c, createBody);
    return ok(c, await designs.create(userId(c), body), 'Đã tạo thiết kế');
  });

  // Phải khai báo trước '/:id' để không bị hiểu là id = "trash".
  app.delete('/trash', async (c) => ok(c, { deleted: await designs.emptyTrash(userId(c)) }, 'Đã dọn thùng rác'));

  app.get('/:id', (c) => ok(c, designs.get(userId(c), c.req.param('id'))));

  app.patch('/:id', async (c) => {
    const body = await readJson(c, updateBody);
    return ok(c, await designs.update(userId(c), c.req.param('id'), body), 'Đã lưu');
  });

  app.delete('/:id', async (c) => {
    const permanent = ['1', 'true', 'yes'].includes(String(c.req.query('permanent') || '').toLowerCase());
    if (permanent) await designs.deletePermanently(userId(c), c.req.param('id'));
    else designs.trash(userId(c), c.req.param('id'));
    return ok(c, null, permanent ? 'Đã xoá hẳn thiết kế' : 'Đã chuyển vào thùng rác');
  });

  app.post('/:id/restore', (c) => ok(c, designs.restore(userId(c), c.req.param('id')), 'Đã khôi phục'));

  app.post('/:id/duplicate', async (c) => ok(c, await designs.duplicate(userId(c), c.req.param('id')), 'Đã nhân bản'));

  app.put('/:id/thumbnail', async (c) => {
    let form;
    try {
      form = await c.req.formData();
    } catch {
      throw badRequest('invalid_input', 'Yêu cầu phải ở dạng multipart/form-data');
    }
    const image = form.get('image');
    if (!image || typeof image === 'string') throw badRequest('invalid_input', 'Thiếu trường "image"');
    if (image.size > 2 * 1024 * 1024) throw tooLarge('Ảnh thu nhỏ vượt quá 2 MB');
    const buffer = Buffer.from(await image.arrayBuffer());
    return ok(c, await designs.setThumbnail(userId(c), c.req.param('id'), buffer));
  });

  app.get('/:id/versions', (c) => ok(c, { items: designs.listVersions(userId(c), c.req.param('id')) }));

  app.post('/:id/versions', async (c) => {
    const body = await readJson(c, versionBody);
    return ok(c, designs.createManualVersion(userId(c), c.req.param('id'), body.label), 'Đã lưu phiên bản');
  });

  app.get('/:id/versions/:versionId', (c) =>
    ok(c, designs.getVersion(userId(c), c.req.param('id'), c.req.param('versionId'))),
  );

  app.post('/:id/versions/:versionId/restore', (c) =>
    ok(c, designs.restoreVersion(userId(c), c.req.param('id'), c.req.param('versionId')), 'Đã khôi phục phiên bản'),
  );

  return app;
}
