import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

export const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/**
 * Trả về đường dẫn tuyệt đối nằm trong `root`, hoặc null nếu `relative`
 * tìm cách thoát ra ngoài (vd "../../etc/passwd").
 */
export function resolveInside(root, relative) {
  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const target = path.resolve(root, `.${path.sep}${decoded}`);
  const base = path.resolve(root);
  return target === base || target.startsWith(base + path.sep) ? target : null;
}

/**
 * Gửi một file có hỗ trợ ETag (304) và Range (206) — đủ cho ảnh, font và video.
 * @param {import('hono').Context} c
 * @param {string} file đường dẫn tuyệt đối đã được kiểm tra
 * @param {Record<string, string>} headers header bổ sung
 */
export async function sendFile(c, file, headers = {}) {
  let stat;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const base = {
    'Content-Type': mimeOf(file),
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  };

  if (c.req.header('if-none-match') === etag) return new Response(null, { status: 304, headers: base });

  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') || '');
  if (range && (range[1] || range[2])) {
    let start;
    let end;
    if (range[1] === '') {
      // "bytes=-500": 500 byte cuối
      start = Math.max(0, stat.size - Number(range[2]));
      end = stat.size - 1;
    } else {
      start = Number(range[1]);
      end = range[2] === '' ? stat.size - 1 : Math.min(Number(range[2]), stat.size - 1);
    }
    if (start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${stat.size}` } });
    }
    const body = c.req.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
    return new Response(body, {
      status: 206,
      headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1) },
    });
  }

  const body = c.req.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(file));
  return new Response(body, { status: 200, headers: { ...base, 'Content-Length': String(stat.size) } });
}

/**
 * Phục vụ bản build của frontend (SPA). File có hash trong tên được cache dài,
 * index.html thì không cache; đường dẫn không có phần mở rộng rơi về index.html.
 */
export function spaHandler(staticDir) {
  const indexFile = path.join(staticDir, 'index.html');
  return async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const file = resolveInside(staticDir, pathname);
    if (file && path.extname(file)) {
      const immutable = pathname.startsWith('/assets/');
      const response = await sendFile(c, file, {
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (response) return response;
      return c.notFound();
    }
    const response = await sendFile(c, indexFile, { 'Cache-Control': 'no-cache' });
    return response ?? c.notFound();
  };
}
