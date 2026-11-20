import sharp from 'sharp';
import { badRequest, notFound, tooLarge } from '../core/http.js';
import { makeThumbnail, processImage } from '../core/images.js';
import { randomId } from '../core/security.js';

const PAGE_SIZE = 30;
const THUMBNAIL_SIDE = 400;
const DAY_MS = 24 * 60 * 60_000;
const CATEGORY = /^[a-z][a-z0-9_-]{0,39}$/;
const KINDS = ['image', 'illustration'];

/** Chỉ tải ảnh từ chính Pixabay: chặn việc dùng endpoint nhập ảnh để dò mạng nội bộ (SSRF). */
function isPixabayUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'pixabay.com' || url.hostname.endsWith('.pixabay.com'));
  } catch {
    return false;
  }
}

/**
 * Kho ảnh và minh hoạ. Mặc định chỉ có thư viện nội bộ do staff đăng; nếu đặt
 * PIXABAY_API_KEY thì kết quả được bổ sung từ Pixabay (cache 24 giờ theo điều khoản của họ).
 *
 * @param {{ db: import('better-sqlite3').Database, config: object,
 *           media: ReturnType<import('../core/media.js').createMediaStore>,
 *           assets: ReturnType<import('../assets/service.js').createAssetService>,
 *           fetchImpl?: typeof fetch }} deps
 */
export function createStockService({ db, config, media, assets, fetchImpl = fetch }) {
  /** Trả đủ tên trường mà cả hai giao diện (ảnh và minh hoạ) của frontend đang đọc. */
  const localHit = (row) => ({
    id: row.id,
    source: 'local',
    tags: row.tags,
    preview: media.url(row.thumbnail),
    previewURL: media.url(row.thumbnail),
    width: row.thumb_width,
    height: row.thumb_height,
    previewWidth: row.thumb_width,
    previewHeight: row.thumb_height,
    largeImageURL: media.url(row.file),
    webformatURL: media.url(row.file),
    imageWidth: row.width,
    imageHeight: row.height,
    needsImport: false,
  });

  const pixabayHit = (hit) => ({
    id: `pixabay-${hit.id}`,
    source: 'pixabay',
    tags: hit.tags,
    preview: hit.previewURL,
    previewURL: hit.previewURL,
    width: hit.previewWidth,
    height: hit.previewHeight,
    previewWidth: hit.previewWidth,
    previewHeight: hit.previewHeight,
    largeImageURL: hit.largeImageURL,
    webformatURL: hit.webformatURL,
    imageWidth: hit.imageWidth,
    imageHeight: hit.imageHeight,
    user: hit.user,
    pageURL: hit.pageURL,
    // URL của Pixabay hết hạn sau 24 giờ: phải nhập về máy chủ trước khi chèn vào thiết kế.
    needsImport: true,
  });

  async function searchPixabay(kind, category, page) {
    if (!config.pixabayApiKey) return [];
    const key = `pixabay:${kind}:${category}:${page}`;
    const cached = db.prepare('SELECT body FROM stock_cache WHERE key = ? AND expires_at > ?').get(key, Date.now());
    if (cached) return JSON.parse(cached.body);

    const url = new URL('https://pixabay.com/api/');
    url.searchParams.set('key', config.pixabayApiKey);
    url.searchParams.set('category', category);
    url.searchParams.set('image_type', kind === 'illustration' ? 'illustration' : 'photo');
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('per_page', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return [];
      const body = await response.json();
      const hits = Array.isArray(body.hits) ? body.hits.map(pixabayHit) : [];
      db.prepare(
        `INSERT INTO stock_cache (key, body, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET body = excluded.body, expires_at = excluded.expires_at`,
      ).run(key, JSON.stringify(hits), Date.now() + DAY_MS);
      return hits;
    } catch {
      return []; // Pixabay lỗi hay chậm không được làm hỏng kho ảnh nội bộ
    }
  }

  /** Danh sách ảnh của một danh mục: ảnh nội bộ trước, rồi tới Pixabay (nếu bật). */
  async function list(kind, category, page = 1) {
    if (!CATEGORY.test(category)) return [];
    const local = db
      .prepare('SELECT * FROM stock_items WHERE kind = ? AND category = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
      .all(kind, category, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .map(localHit);
    return [...local, ...(await searchPixabay(kind, category, page))];
  }

  /** Staff thêm một ảnh vào kho dùng chung. */
  async function add(userId, buffer, { kind, category, tags = '' }) {
    if (!KINDS.includes(kind)) throw badRequest('invalid_input', 'Loại phải là "image" hoặc "illustration"');
    if (!CATEGORY.test(String(category || ''))) throw badRequest('invalid_input', 'Danh mục không hợp lệ');
    if (buffer.length > config.maxUploadBytes) {
      throw tooLarge(`Ảnh vượt quá ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB`);
    }
    const image = await processImage(buffer, { maxPixels: config.maxImagePixels });
    const thumbnail = await makeThumbnail(image.data, { side: THUMBNAIL_SIDE, maxPixels: config.maxImagePixels });
    const thumbMeta = await sharp(thumbnail).metadata();
    const id = randomId();
    const file = `stock/${id}.${image.ext}`;
    const thumb = `stock/t/${id}.webp`;
    await media.write(file, image.data);
    await media.write(thumb, thumbnail);
    try {
      const info = db
        .prepare(
          `INSERT INTO stock_items (kind, category, tags, file, thumbnail, width, height, thumb_width, thumb_height, size, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(kind, category, String(tags).trim().slice(0, 200), file, thumb, image.width, image.height,
          thumbMeta.width, thumbMeta.height, image.data.length, userId, Date.now());
      return localHit(db.prepare('SELECT * FROM stock_items WHERE id = ?').get(info.lastInsertRowid));
    } catch (err) {
      await media.remove(file);
      await media.remove(thumb);
      throw err;
    }
  }

  async function remove(id) {
    const row = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(Number(id));
    if (!row) throw notFound('Không tìm thấy ảnh trong kho');
    db.prepare('DELETE FROM stock_items WHERE id = ?').run(row.id);
    await media.remove(row.file);
    await media.remove(row.thumbnail);
  }

  /**
   * Tải một ảnh Pixabay về kho ảnh của người dùng và trả về ảnh đã lưu, để tài liệu thiết kế
   * chỉ tham chiếu URL của chính máy chủ này.
   */
  async function importRemote(userId, url) {
    if (!config.pixabayApiKey) throw badRequest('stock_disabled', 'Máy chủ chưa bật kho ảnh Pixabay');
    if (!isPixabayUrl(url)) throw badRequest('invalid_input', 'Chỉ nhập được ảnh từ Pixabay');
    let response;
    try {
      // redirect: 'error' — không đi theo chuyển hướng sang máy chủ khác.
      response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    } catch {
      throw badRequest('import_failed', 'Không tải được ảnh từ Pixabay');
    }
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > config.maxUploadBytes) throw tooLarge('Ảnh quá lớn');
    let buffer;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > config.maxUploadBytes) {
          await reader.cancel().catch(() => {});
          throw tooLarge('Ảnh quá lớn');
        }
        chunks.push(value);
      }
      buffer = Buffer.concat(chunks);
    } else {
      buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > config.maxUploadBytes) throw tooLarge('Ảnh quá lớn');
    }
    return assets.upload(userId, buffer, 'pixabay');
  }

  const purgeCache = () => db.prepare('DELETE FROM stock_cache WHERE expires_at <= ?').run(Date.now());

  return { list, add, remove, importRemote, purgeCache };
}
