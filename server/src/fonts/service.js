import { badRequest, notFound, tooLarge } from '../core/http.js';
import { randomId } from '../core/security.js';

// Tên font được chèn vào CSS (@font-face) ở trình duyệt, nên chỉ cho phép chữ, số và vài dấu vô hại.
const FONT_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,59}$/u;

/** Nhận diện định dạng font bằng 4 byte đầu, không dựa vào tên file. */
function sniffFont(buffer) {
  if (buffer.length < 12) return null;
  const tag = buffer.subarray(0, 4).toString('latin1');
  if (tag === 'wOF2') return { ext: 'woff2', format: 'woff2' };
  if (tag === 'wOFF') return { ext: 'woff', format: 'woff' };
  if (tag === 'OTTO') return { ext: 'otf', format: 'opentype' };
  if (tag === 'true' || buffer.readUInt32BE(0) === 0x00010000) return { ext: 'ttf', format: 'truetype' };
  return null;
}

/**
 * Font dùng chung do staff tải lên (vd font hỗ trợ tiếng Việt).
 * @param {{ db: import('better-sqlite3').Database, config: object,
 *           media: ReturnType<import('../core/media.js').createMediaStore> }} deps
 */
export function createFontService({ db, config, media }) {
  const view = (row) => ({ id: row.id, fontname: row.fontname, url: media.url(row.file), format: row.format, size: row.size });

  const list = () => db.prepare('SELECT * FROM fonts ORDER BY fontname COLLATE NOCASE').all().map(view);

  async function upload(userId, buffer, rawName) {
    if (buffer.length > config.maxFontBytes) {
      throw tooLarge(`File font vượt quá ${Math.floor(config.maxFontBytes / 1024 / 1024)} MB`);
    }
    const kind = sniffFont(buffer);
    if (!kind) throw badRequest('invalid_font', 'File không phải font TTF, OTF, WOFF hoặc WOFF2 hợp lệ');
    const fontname = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!FONT_NAME.test(fontname)) {
      throw badRequest('invalid_font_name', 'Tên font chỉ gồm chữ, số, dấu cách, dấu chấm, gạch dưới, gạch ngang (tối đa 60 ký tự)');
    }
    if (db.prepare('SELECT 1 FROM fonts WHERE fontname = ? COLLATE NOCASE').get(fontname)) {
      throw badRequest('font_exists', `Đã có font tên "${fontname}"`);
    }

    const file = `fonts/${randomId()}.${kind.ext}`;
    await media.write(file, buffer);
    try {
      const info = db
        .prepare('INSERT INTO fonts (fontname, file, format, size, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(fontname, file, kind.format, buffer.length, userId, Date.now());
      return view(db.prepare('SELECT * FROM fonts WHERE id = ?').get(info.lastInsertRowid));
    } catch (err) {
      await media.remove(file);
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) throw badRequest('font_exists', `Đã có font tên "${fontname}"`);
      throw err;
    }
  }

  async function remove(id) {
    const row = db.prepare('SELECT * FROM fonts WHERE id = ?').get(Number(id));
    if (!row) throw notFound('Không tìm thấy font');
    db.prepare('DELETE FROM fonts WHERE id = ?').run(row.id);
    await media.remove(row.file);
  }

  return { list, upload, remove };
}
