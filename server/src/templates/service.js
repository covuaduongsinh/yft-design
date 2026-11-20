import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { notFound, tooLarge } from '../core/http.js';
import { makeThumbnail } from '../core/images.js';
import { randomId } from '../core/security.js';
import { decodeDocument, encodeForClient } from '../designs/document.js';

const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);

const PREVIEW_SIDE = 800;
const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW_MAX_PIXELS = 25_000_000;
const LIST_COLUMNS = 'id, title, text, category, width, height, page_count, preview, is_published, use_count, created_at, updated_at';

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

/**
 * Template dùng chung do staff đăng. Người dùng thường chỉ thấy template đã bật `is_published`.
 * @param {{ db: import('better-sqlite3').Database, config: object,
 *           media: ReturnType<import('../core/media.js').createMediaStore> }} deps
 */
export function createTemplateService({ db, config, media }) {
  const view = (row) => ({
    id: row.id,
    title: row.title,
    text: row.text,
    category: row.category,
    width: row.width,
    height: row.height,
    page_count: row.page_count,
    preview: media.url(row.preview),
    is_published: Boolean(row.is_published),
    use_count: row.use_count,
    created_at: row.created_at,
  });

  function find(id, { includeUnpublished }) {
    const row = db.prepare(`SELECT ${LIST_COLUMNS} FROM templates WHERE id = ?`).get(Number(id));
    if (!row || (!row.is_published && !includeUnpublished)) throw notFound('Không tìm thấy mẫu');
    return row;
  }

  function list({ page = 1, size = 20, q = '', includeUnpublished = false }) {
    const where = [];
    const params = [];
    if (!includeUnpublished) where.push('is_published = 1');
    if (q.trim()) {
      where.push("(title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')");
      const like = `%${q.trim().replace(/[%_\\]/g, '\\$&')}%`;
      params.push(like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT count(*) AS n FROM templates ${clause}`).get(...params).n;
    const rows = db
      .prepare(`SELECT ${LIST_COLUMNS} FROM templates ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, size, (page - 1) * size);
    const totalPages = Math.max(1, Math.ceil(total / size));
    // `pages` và `total_pages` cùng nghĩa; frontend cũ đọc cả hai tên.
    return { total, page, size, total_pages: totalPages, pages: totalPages, items: rows.map(view) };
  }

  /** Trả về template kèm tài liệu để mở trong trình chỉnh sửa, và tính một lượt sử dụng. */
  function getData(id, { includeUnpublished }) {
    const row = find(id, { includeUnpublished });
    const data = db.prepare('SELECT data FROM templates WHERE id = ?').get(row.id).data;
    db.prepare('UPDATE templates SET use_count = use_count + 1 WHERE id = ?').run(row.id);
    return { ...view(row), data: encodeForClient(data) };
  }

  /**
   * Đăng một template. Mọi ảnh tải lên (/media/a/...) mà tài liệu tham chiếu được sao thành
   * bản riêng của template, để template không hỏng khi người đăng xoá ảnh hay thiết kế gốc.
   */
  async function create(userId, { title, text, category, data, is_published: isPublished = true }) {
    const document = await decodeDocument(data, config.maxDesignDocumentBytes);
    let json = (await gunzip(document.blob)).toString('utf8');

    const copied = [];
    try {
      for (const match of new Set(json.match(/\/media\/a\/[0-9a-f]{32}\.[a-z0-9]+/g) || [])) {
        const source = match.replace('/media/', '');
        if (!media.exists(source)) continue;
        const target = `tpl/${randomId()}${source.slice(source.lastIndexOf('.'))}`;
        await media.copy(source, target);
        copied.push(target);
        json = json.split(match).join(media.url(target));
      }
      const blob = await gzip(Buffer.from(json, 'utf8'));
      const t = Date.now();
      const id = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO templates (title, text, category, width, height, page_count, is_published, created_by, created_at, updated_at, data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            clean(title, 200) || 'Mẫu chưa đặt tên',
            clean(text, 500),
            clean(category, 60),
            document.width,
            document.height,
            document.pageCount,
            isPublished ? 1 : 0,
            userId,
            t,
            t,
            blob,
          );
        const insertFile = db.prepare('INSERT INTO template_files (template_id, path) VALUES (?, ?)');
        for (const file of copied) insertFile.run(info.lastInsertRowid, file);
        return Number(info.lastInsertRowid);
      })();
      return view(find(id, { includeUnpublished: true }));
    } catch (err) {
      await Promise.all(copied.map((file) => media.remove(file)));
      throw err;
    }
  }

  function update(id, { title, text, category, is_published: isPublished }) {
    const row = find(id, { includeUnpublished: true });
    db.prepare(
      `UPDATE templates SET title = ?, text = ?, category = ?, is_published = ?, updated_at = ? WHERE id = ?`,
    ).run(
      title !== undefined ? clean(title, 200) || row.title : row.title,
      text !== undefined ? clean(text, 500) : row.text,
      category !== undefined ? clean(category, 60) : row.category,
      isPublished !== undefined ? (isPublished ? 1 : 0) : row.is_published,
      Date.now(),
      row.id,
    );
    return view(find(row.id, { includeUnpublished: true }));
  }

  async function setPreview(id, buffer) {
    const row = find(id, { includeUnpublished: true });
    if (buffer.length > PREVIEW_MAX_BYTES) throw tooLarge('Ảnh xem trước vượt quá 5 MB');
    const webp = await makeThumbnail(buffer, { side: PREVIEW_SIDE, maxPixels: PREVIEW_MAX_PIXELS });
    const relative = `tpl/${randomId()}.webp`;
    await media.write(relative, webp);
    db.prepare('UPDATE templates SET preview = ?, updated_at = ? WHERE id = ?').run(relative, Date.now(), row.id);
    await media.remove(row.preview);
    return view(find(row.id, { includeUnpublished: true }));
  }

  async function remove(id) {
    const row = find(id, { includeUnpublished: true });
    const files = db.prepare('SELECT path FROM template_files WHERE template_id = ?').all(row.id).map((item) => item.path);
    db.prepare('DELETE FROM templates WHERE id = ?').run(row.id);
    await Promise.all([...files, row.preview].map((file) => media.remove(file)));
  }

  return { list, getData, create, update, setPreview, remove };
}
