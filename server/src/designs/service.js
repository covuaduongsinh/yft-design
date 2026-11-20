import { badRequest, conflict, notFound, tooLarge } from '../core/http.js';
import { makeThumbnail } from '../core/images.js';
import { randomId, uuid } from '../core/security.js';
import { decodeDocument, encodeForClient } from './document.js';

export const DEFAULT_TITLE = 'Thiết kế chưa đặt tên';
const TITLE_MAX = 200;
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_MAX_PIXELS = 16_000_000;
const THUMBNAIL_SIDE = 480;
const DAY_MS = 24 * 60 * 60_000;

const SUMMARY_COLUMNS =
  'id, owner_id, title, width, height, page_count, thumbnail, starred, revision, data_bytes, trashed_at, created_at, updated_at';

const cleanTitle = (title, fallback = DEFAULT_TITLE) => {
  const value = String(title ?? '').trim().slice(0, TITLE_MAX);
  return value || fallback;
};

/**
 * Thiết kế của người dùng. Mọi truy vấn đều lọc theo chủ sở hữu; thiết kế của người
 * khác được coi như không tồn tại (404) để không lộ việc id đó có thật hay không.
 *
 * @param {{ db: import('better-sqlite3').Database, config: object,
 *           media: ReturnType<import('../core/media.js').createMediaStore>,
 *           storage: { used(userId: number): number } }} deps
 */
export function createDesignService({ db, config, media, storage }) {
  const view = (row) => ({
    id: row.id,
    title: row.title,
    width: row.width,
    height: row.height,
    page_count: row.page_count,
    thumbnail: media.url(row.thumbnail),
    starred: Boolean(row.starred),
    revision: row.revision,
    trashed_at: row.trashed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  const versionView = (row) => ({
    id: row.id,
    label: row.label,
    is_auto: Boolean(row.is_auto),
    page_count: row.page_count,
    revision: row.revision,
    created_at: row.created_at,
  });

  function own(userId, id) {
    const row = db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM designs WHERE id = ? AND owner_id = ?`).get(String(id), userId);
    if (!row) throw notFound('Không tìm thấy thiết kế');
    return row;
  }

  const readDocument = (id) => db.prepare('SELECT data FROM design_documents WHERE design_id = ?').get(id)?.data;

  const withDocument = (row) => ({ ...view(row), data: encodeForClient(readDocument(row.id)) });

  function assertQuota(userId, addedBytes) {
    if (addedBytes <= 0) return;
    if (storage.used(userId) + addedBytes > config.userStorageQuotaBytes) {
      throw tooLarge('Đã vượt hạn mức lưu trữ của tài khoản. Hãy xoá bớt thiết kế hoặc ảnh không dùng.');
    }
  }

  function assertDesignLimit(userId) {
    const count = db.prepare('SELECT count(*) AS n FROM designs WHERE owner_id = ?').get(userId).n;
    if (count >= config.maxDesignsPerUser) {
      throw badRequest('limit_reached', `Mỗi tài khoản chỉ lưu được tối đa ${config.maxDesignsPerUser} thiết kế`);
    }
  }

  function insertVersion({ designId, label, isAuto, pageCount, revision, blob, userId }) {
    const id = uuid();
    db.prepare(
      `INSERT INTO design_versions (id, design_id, label, is_auto, page_count, revision, data_bytes, created_by, created_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, designId, label.slice(0, 120), isAuto ? 1 : 0, pageCount, revision, blob.length, userId, Date.now(), blob);
    return id;
  }

  /** Giữ lại N phiên bản tự động mới nhất; phiên bản thủ công không bao giờ bị tỉa. */
  function pruneAutoVersions(designId) {
    db.prepare(
      `DELETE FROM design_versions WHERE design_id = ? AND is_auto = 1 AND id NOT IN (
         SELECT id FROM design_versions WHERE design_id = ? AND is_auto = 1
         ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
    ).run(designId, designId, config.maxAutoVersions);
  }

  // ---------- Danh sách / đọc ----------

  function list(userId, { q = '', starred, trashed = false, page = 1, size = 20, ordering = '-updated_at' }) {
    const columns = { updated_at: 'updated_at', created_at: 'created_at', title: 'title COLLATE NOCASE' };
    const descending = ordering.startsWith('-');
    const column = columns[ordering.replace(/^-/, '')] || columns.updated_at;

    const where = ['owner_id = ?', trashed ? 'trashed_at IS NOT NULL' : 'trashed_at IS NULL'];
    const params = [userId];
    if (q.trim()) {
      where.push("title LIKE ? ESCAPE '\\'");
      params.push(`%${q.trim().replace(/[%_\\]/g, '\\$&')}%`);
    }
    if (starred !== undefined) {
      where.push('starred = ?');
      params.push(starred ? 1 : 0);
    }
    const clause = where.join(' AND ');
    const total = db.prepare(`SELECT count(*) AS n FROM designs WHERE ${clause}`).get(...params).n;
    const rows = db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM designs WHERE ${clause}
         ORDER BY ${column} ${descending ? 'DESC' : 'ASC'}, id LIMIT ? OFFSET ?`,
      )
      .all(...params, size, (page - 1) * size);
    return { total, page, size, total_pages: Math.max(1, Math.ceil(total / size)), items: rows.map(view) };
  }

  const get = (userId, id) => withDocument(own(userId, id));

  // ---------- Tạo / sửa ----------

  async function create(userId, { title, data }) {
    const document = await decodeDocument(data, config.maxDesignDocumentBytes);
    const id = uuid();
    const t = Date.now();
    db.transaction(() => {
      assertDesignLimit(userId);
      assertQuota(userId, document.blob.length);
      db.prepare(
        `INSERT INTO designs (id, owner_id, title, width, height, page_count, data_bytes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, userId, cleanTitle(title), document.width, document.height, document.pageCount, document.blob.length, t, t);
      db.prepare('INSERT INTO design_documents (design_id, data) VALUES (?, ?)').run(id, document.blob);
    })();
    return view(own(userId, id));
  }

  /**
   * Sửa thiết kế. Đổi tên/gắn sao không cần kiểm tra gì thêm; lưu tài liệu thì phải gửi
   * `base_revision` là revision mà client đã tải về — lệch với bản đang lưu tức là thiết kế
   * đã bị sửa ở nơi khác, trả 409 thay vì ghi đè.
   */
  async function update(userId, id, { title, starred, data, base_revision: baseRevision }) {
    // Giải nén và kiểm tra tài liệu trước (bất đồng bộ), transaction bên dưới là đồng bộ.
    const document = data !== undefined ? await decodeDocument(data, config.maxDesignDocumentBytes) : null;
    if (document && !Number.isInteger(baseRevision)) {
      throw badRequest('missing_base_revision', 'Thiếu base_revision khi lưu tài liệu thiết kế');
    }

    db.transaction(() => {
      const row = own(userId, id);
      const t = Date.now();

      if (title !== undefined) {
        db.prepare('UPDATE designs SET title = ?, updated_at = ? WHERE id = ?').run(cleanTitle(title, row.title), t, row.id);
      }
      if (starred !== undefined) {
        db.prepare('UPDATE designs SET starred = ? WHERE id = ?').run(starred ? 1 : 0, row.id);
      }
      if (!document) return;

      if (row.trashed_at) throw conflict('design_trashed', 'Thiết kế đang ở thùng rác, hãy khôi phục trước khi sửa');
      if (baseRevision !== row.revision) {
        throw conflict('revision_conflict', 'Thiết kế này đã được sửa ở nơi khác. Hãy tải lại hoặc lưu thành bản sao.', {
          current: { revision: row.revision, updated_at: row.updated_at },
        });
      }

      // Phiên bản tự động: giữ lại bản CŨ trước khi ghi đè, nếu bản chụp gần nhất đã đủ lâu.
      const previous = readDocument(row.id);
      const newest = db
        .prepare('SELECT created_at FROM design_versions WHERE design_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(row.id);
      const due = !newest || t - newest.created_at >= config.autoVersionIntervalMinutes * 60_000;
      const snapshotBytes = due ? previous.length : 0;

      assertQuota(userId, document.blob.length - row.data_bytes + snapshotBytes);

      if (due) {
        insertVersion({
          designId: row.id,
          label: '',
          isAuto: true,
          pageCount: row.page_count,
          revision: row.revision,
          blob: previous,
          userId,
        });
        pruneAutoVersions(row.id);
      }

      db.prepare('UPDATE design_documents SET data = ? WHERE design_id = ?').run(document.blob, row.id);
      db.prepare(
        `UPDATE designs SET width = ?, height = ?, page_count = ?, data_bytes = ?, revision = revision + 1, updated_at = ?
         WHERE id = ?`,
      ).run(document.width, document.height, document.pageCount, document.blob.length, t, row.id);
    })();

    return view(own(userId, id));
  }

  async function duplicate(userId, id) {
    const source = own(userId, id);
    if (source.trashed_at) throw conflict('design_trashed', 'Không thể nhân bản thiết kế đang ở thùng rác');
    const blob = readDocument(source.id);
    const newId = uuid();
    const t = Date.now();

    let thumbnail = '';
    if (source.thumbnail && media.exists(source.thumbnail)) {
      thumbnail = `thumbs/${randomId()}.webp`;
      await media.copy(source.thumbnail, thumbnail);
    }
    try {
      db.transaction(() => {
        assertDesignLimit(userId);
        assertQuota(userId, blob.length);
        db.prepare(
          `INSERT INTO designs (id, owner_id, title, width, height, page_count, thumbnail, data_bytes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newId,
          userId,
          cleanTitle(`Bản sao của ${source.title}`),
          source.width,
          source.height,
          source.page_count,
          thumbnail,
          blob.length,
          t,
          t,
        );
        db.prepare('INSERT INTO design_documents (design_id, data) VALUES (?, ?)').run(newId, blob);
      })();
    } catch (err) {
      await media.remove(thumbnail);
      throw err;
    }
    return view(own(userId, newId));
  }

  // ---------- Thùng rác ----------

  function trash(userId, id) {
    const row = own(userId, id);
    if (!row.trashed_at) db.prepare('UPDATE designs SET trashed_at = ? WHERE id = ?').run(Date.now(), row.id);
  }

  function restore(userId, id) {
    const row = own(userId, id);
    db.prepare('UPDATE designs SET trashed_at = NULL WHERE id = ?').run(row.id);
    return view(own(userId, id));
  }

  /** Xoá hẳn các thiết kế khớp điều kiện, kèm thumbnail của chúng. Phiên bản bị xoá theo (CASCADE). */
  async function purge(where, ...params) {
    const rows = db.prepare(`SELECT id, thumbnail FROM designs WHERE ${where}`).all(...params);
    if (rows.length === 0) return 0;
    const remove = db.prepare('DELETE FROM designs WHERE id = ?');
    db.transaction(() => rows.forEach((row) => remove.run(row.id)))();
    await Promise.all(rows.map((row) => media.remove(row.thumbnail)));
    return rows.length;
  }

  async function deletePermanently(userId, id) {
    const row = own(userId, id);
    if (!row.trashed_at) throw badRequest('not_in_trash', 'Chỉ xoá hẳn được thiết kế đang ở thùng rác');
    await purge('id = ?', row.id);
  }

  const emptyTrash = (userId) => purge('owner_id = ? AND trashed_at IS NOT NULL', userId);

  /** Dọn định kỳ: thiết kế nằm trong thùng rác quá số ngày quy định bị xoá hẳn. */
  const purgeExpiredTrash = () =>
    purge('trashed_at IS NOT NULL AND trashed_at < ?', Date.now() - config.trashRetentionDays * DAY_MS);

  // ---------- Thumbnail ----------

  async function setThumbnail(userId, id, buffer) {
    const row = own(userId, id);
    if (row.trashed_at) throw conflict('design_trashed', 'Thiết kế đang ở thùng rác');
    if (buffer.length > THUMBNAIL_MAX_BYTES) throw tooLarge('Ảnh thu nhỏ vượt quá 2 MB');
    const webp = await makeThumbnail(buffer, { side: THUMBNAIL_SIDE, maxPixels: THUMBNAIL_MAX_PIXELS });
    const relative = `thumbs/${randomId()}.webp`;
    await media.write(relative, webp);
    db.prepare('UPDATE designs SET thumbnail = ? WHERE id = ?').run(relative, row.id);
    await media.remove(row.thumbnail);
    return { thumbnail: media.url(relative) };
  }

  // ---------- Phiên bản ----------

  function listVersions(userId, id) {
    const row = own(userId, id);
    return db
      .prepare(
        `SELECT id, label, is_auto, page_count, revision, created_at FROM design_versions
         WHERE design_id = ? ORDER BY created_at DESC, rowid DESC`,
      )
      .all(row.id)
      .map(versionView);
  }

  function createManualVersion(userId, id, label) {
    let versionId;
    db.transaction(() => {
      const row = own(userId, id);
      const manual = db
        .prepare('SELECT count(*) AS n FROM design_versions WHERE design_id = ? AND is_auto = 0')
        .get(row.id).n;
      if (manual >= config.maxManualVersions) {
        throw badRequest('limit_reached', `Mỗi thiết kế chỉ lưu được tối đa ${config.maxManualVersions} phiên bản thủ công`);
      }
      const blob = readDocument(row.id);
      assertQuota(userId, blob.length);
      versionId = insertVersion({
        designId: row.id,
        label: String(label || '').trim() || 'Phiên bản đã lưu',
        isAuto: false,
        pageCount: row.page_count,
        revision: row.revision,
        blob,
        userId,
      });
    })();
    return versionView(db.prepare('SELECT * FROM design_versions WHERE id = ?').get(versionId));
  }

  function getVersion(userId, id, versionId) {
    const row = own(userId, id);
    const version = db.prepare('SELECT * FROM design_versions WHERE id = ? AND design_id = ?').get(String(versionId), row.id);
    if (!version) throw notFound('Không tìm thấy phiên bản');
    return { ...versionView(version), data: encodeForClient(version.data) };
  }

  /** Khôi phục một phiên bản: luôn chụp lại trạng thái hiện tại trước, để thao tác này hoàn tác được. */
  function restoreVersion(userId, id, versionId) {
    db.transaction(() => {
      const row = own(userId, id);
      if (row.trashed_at) throw conflict('design_trashed', 'Thiết kế đang ở thùng rác');
      const version = db.prepare('SELECT * FROM design_versions WHERE id = ? AND design_id = ?').get(String(versionId), row.id);
      if (!version) throw notFound('Không tìm thấy phiên bản');

      insertVersion({
        designId: row.id,
        label: 'Trước khi khôi phục',
        isAuto: true,
        pageCount: row.page_count,
        revision: row.revision,
        blob: readDocument(row.id),
        userId,
      });
      db.prepare('UPDATE design_documents SET data = ? WHERE design_id = ?').run(version.data, row.id);
      db.prepare(
        'UPDATE designs SET page_count = ?, data_bytes = ?, revision = revision + 1, updated_at = ? WHERE id = ?',
      ).run(version.page_count, version.data.length, Date.now(), row.id);
      pruneAutoVersions(row.id);
    })();
    return get(userId, id);
  }

  return {
    list,
    get,
    create,
    update,
    duplicate,
    trash,
    restore,
    deletePermanently,
    emptyTrash,
    purgeExpiredTrash,
    setThumbnail,
    listVersions,
    createManualVersion,
    getVersion,
    restoreVersion,
  };
}
