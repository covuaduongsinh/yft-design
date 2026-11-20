import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound, tooLarge } from '../core/http.js';
import { makeThumbnail, processImage } from '../core/images.js';
import { randomId } from '../core/security.js';

const THUMBNAIL_SIDE = 320;
const HOUR_MS = 60 * 60_000;
/** Ảnh vừa tải lên có thể chưa kịp được thiết kế nào lưu lại: chờ ngần này rồi mới coi là rác. */
const UNUSED_GRACE_MS = 24 * HOUR_MS;

const filePath = (row) => `a/${row.id}.${row.ext}`;
const thumbPath = (row) => `a/t/${row.id}.webp`;

/** Tìm id của mọi ảnh /media/a/<id>.<ext> xuất hiện trong một chuỗi JSON. */
export function extractAssetIds(json) {
  const ids = new Set();
  for (const match of json.matchAll(/\/media\/a\/([0-9a-f]{32})\./g)) ids.add(match[1]);
  return [...ids];
}

/**
 * Ảnh tải lên của người dùng.
 * @param {{ db: import('better-sqlite3').Database, config: object,
 *           media: ReturnType<import('../core/media.js').createMediaStore>,
 *           storage: { used(userId: number): number } }} deps
 */
export function createAssetService({ db, config, media, storage }) {
  const view = (row) => ({
    id: row.id,
    name: row.name,
    url: media.url(filePath(row)),
    thumbnail: row.thumbnail_size > 0 ? media.url(thumbPath(row)) : media.url(filePath(row)),
    mime: row.mime,
    width: row.width,
    height: row.height,
    size: row.size,
    created_at: row.created_at,
  });

  const findBySha = (userId, sha256) =>
    db.prepare('SELECT * FROM assets WHERE owner_id = ? AND sha256 = ?').get(userId, sha256);

  /**
   * Lưu một ảnh. Loại file được xác định bằng cách giải mã nội dung, không dựa vào tên file
   * hay Content-Type. Gửi lại đúng file cũ thì nhận lại ảnh đã có (không tốn thêm hạn mức).
   */
  async function upload(userId, buffer, name = '') {
    if (buffer.length === 0) throw badRequest('invalid_image', 'File rỗng');
    if (buffer.length > config.maxUploadBytes) {
      throw tooLarge(`Ảnh vượt quá ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB`);
    }
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const existing = findBySha(userId, sha256);
    if (existing) return view(existing);

    const image = await processImage(buffer, { maxPixels: config.maxImagePixels });
    let thumbnail = null;
    try {
      thumbnail = await makeThumbnail(image.data, { side: THUMBNAIL_SIDE, maxPixels: config.maxImagePixels });
    } catch {
      // Không tạo được ảnh thu nhỏ thì dùng luôn ảnh gốc để xem trước.
    }

    const row = {
      id: randomId(),
      owner_id: userId,
      sha256,
      name: String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200),
      mime: image.mime,
      ext: image.ext,
      width: image.width,
      height: image.height,
      size: image.data.length,
      thumbnail_size: thumbnail ? thumbnail.length : 0,
      created_at: Date.now(),
    };

    // Ghi file trước (tên ngẫu nhiên nên không đụng ai), rồi mới kiểm tra hạn mức và ghi CSDL
    // trong một transaction đồng bộ. Lỗi ở bước nào cũng dọn file vừa ghi.
    await media.write(filePath(row), image.data);
    if (thumbnail) await media.write(thumbPath(row), thumbnail);
    try {
      db.transaction(() => {
        if (storage.used(userId) + row.size + row.thumbnail_size > config.userStorageQuotaBytes) {
          throw tooLarge('Đã vượt hạn mức lưu trữ của tài khoản. Hãy xoá bớt thiết kế không dùng.');
        }
        db.prepare(
          `INSERT INTO assets (id, owner_id, sha256, name, mime, ext, width, height, size, thumbnail_size, created_at)
           VALUES (@id, @owner_id, @sha256, @name, @mime, @ext, @width, @height, @size, @thumbnail_size, @created_at)`,
        ).run(row);
      })();
    } catch (err) {
      await removeFiles(row);
      // Hai request cùng gửi một file: request về sau dùng lại bản ghi của request trước.
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
        const winner = findBySha(userId, sha256);
        if (winner) return view(winner);
      }
      throw err;
    }
    return view(row);
  }

  async function removeFiles(row) {
    await media.remove(filePath(row));
    await media.remove(thumbPath(row));
  }

  function list(userId, { page = 1, size = 30 }) {
    const total = db.prepare('SELECT count(*) AS n FROM assets WHERE owner_id = ?').get(userId).n;
    const rows = db
      .prepare('SELECT * FROM assets WHERE owner_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?')
      .all(userId, size, (page - 1) * size);
    return { total, page, size, total_pages: Math.max(1, Math.ceil(total / size)), items: rows.map(view) };
  }

  /** Xoá một ảnh theo yêu cầu của chủ sở hữu. Thiết kế nào còn dùng ảnh này sẽ mất hình. */
  async function remove(userId, id) {
    const row = db.prepare('SELECT * FROM assets WHERE id = ? AND owner_id = ?').get(String(id), userId);
    if (!row) throw notFound('Không tìm thấy ảnh');
    db.prepare('DELETE FROM assets WHERE id = ?').run(row.id);
    await removeFiles(row);
  }

  const usage = (userId) => ({ used_bytes: storage.used(userId), quota_bytes: config.userStorageQuotaBytes });

  // ---------- Tham chiếu từ thiết kế ----------

  /** Ghi nhận các ảnh mà tài liệu hiện tại của thiết kế đang dùng (gọi trong transaction lưu thiết kế). */
  function setDesignRefs(designId, assetIds) {
    db.prepare('DELETE FROM design_asset_refs WHERE design_id = ?').run(designId);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO design_asset_refs (design_id, asset_id) SELECT ?, id FROM assets WHERE id = ?',
    );
    for (const assetId of assetIds) insert.run(designId, assetId);
  }

  /** Phiên bản chụp lại tài liệu hiện tại nên kế thừa đúng danh sách ảnh của thiết kế lúc đó. */
  function copyDesignRefsToVersion(designId, versionId) {
    db.prepare(
      `INSERT OR IGNORE INTO version_asset_refs (version_id, asset_id)
       SELECT ?, asset_id FROM design_asset_refs WHERE design_id = ?`,
    ).run(versionId, designId);
  }

  function copyVersionRefsToDesign(versionId, designId) {
    db.prepare('DELETE FROM design_asset_refs WHERE design_id = ?').run(designId);
    db.prepare(
      `INSERT OR IGNORE INTO design_asset_refs (design_id, asset_id)
       SELECT ?, asset_id FROM version_asset_refs WHERE version_id = ?`,
    ).run(designId, versionId);
  }

  function copyDesignRefs(fromDesignId, toDesignId) {
    db.prepare(
      `INSERT OR IGNORE INTO design_asset_refs (design_id, asset_id)
       SELECT ?, asset_id FROM design_asset_refs WHERE design_id = ?`,
    ).run(toDesignId, fromDesignId);
  }

  // ---------- Dọn dẹp ----------

  /**
   * Xoá ảnh không còn thiết kế hay phiên bản nào dùng (của bất kỳ ai) và đã quá thời gian chờ.
   * Nhờ vậy xoá thiết kế là hạn mức được trả lại, không cần người dùng tự quản lý ảnh.
   */
  async function purgeUnused(graceMs = UNUSED_GRACE_MS) {
    const rows = db
      .prepare(
        `SELECT * FROM assets a WHERE a.created_at < ?
           AND NOT EXISTS (SELECT 1 FROM design_asset_refs r WHERE r.asset_id = a.id)
           AND NOT EXISTS (SELECT 1 FROM version_asset_refs r WHERE r.asset_id = a.id)`,
      )
      .all(Date.now() - graceMs);
    if (rows.length === 0) return 0;
    const remove = db.prepare('DELETE FROM assets WHERE id = ?');
    db.transaction(() => rows.forEach((row) => remove.run(row.id)))();
    for (const row of rows) await removeFiles(row);
    return rows.length;
  }

  /** Xoá file trong media/a không có bản ghi tương ứng (sót lại khi tiến trình chết giữa lúc tải lên). */
  async function sweepOrphanFiles(minAgeMs = HOUR_MS) {
    const known = db.prepare('SELECT 1 FROM assets WHERE id = ?');
    let removed = 0;
    for (const dir of ['a', path.join('a', 't')]) {
      let entries;
      try {
        entries = await fs.promises.readdir(path.join(media.dir, dir), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const id = entry.name.split('.')[0];
        if (/^[0-9a-f]{32}$/.test(id) && known.get(id)) continue;
        const file = path.join(media.dir, dir, entry.name);
        const stat = await fs.promises.stat(file).catch(() => null);
        if (!stat || Date.now() - stat.mtimeMs < minAgeMs) continue;
        await fs.promises.unlink(file).catch(() => undefined);
        removed += 1;
      }
    }
    return removed;
  }

  return {
    upload,
    list,
    remove,
    usage,
    setDesignRefs,
    copyDesignRefsToVersion,
    copyVersionRefsToDesign,
    copyDesignRefs,
    purgeUnused,
    sweepOrphanFiles,
  };
}
