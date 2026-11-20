import crypto from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import { tooMany } from './http.js';

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Chuỗi ngẫu nhiên dạng base64url, mặc định 256 bit. */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Định danh ngẫu nhiên dạng hex, mặc định 128 bit — dùng cho URL không đoán được. */
export const randomId = (bytes = 16) => crypto.randomBytes(bytes).toString('hex');

export const uuid = () => crypto.randomUUID();

/** So sánh hai chuỗi trong thời gian không phụ thuộc nội dung. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * IP của client. Chỉ tin X-Forwarded-For khi đã khai báo số proxy đứng trước
 * (TRUST_PROXY_HOPS), và chỉ lấy đúng mục do proxy tin cậy ngoài cùng ghi vào.
 */
export function clientIp(c, trustProxyHops) {
  if (trustProxyHops > 0) {
    const forwarded = (c.req.header('x-forwarded-for') || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const picked = forwarded[forwarded.length - trustProxyHops];
    if (picked) return picked;
  }
  try {
    return getConnInfo(c).remote.address || 'unknown';
  } catch {
    return 'unknown'; // gọi app trực tiếp trong test, không có socket
  }
}

/**
 * Giới hạn tần suất kiểu cửa sổ cố định, lưu trong bộ nhớ (server chạy một tiến trình).
 * @param {{ limit: number, windowMs?: number }} options
 */
export function createRateLimiter({ limit, windowMs = 60_000 }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();

  const sweep = setInterval(() => {
    const t = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= t) buckets.delete(key);
  }, windowMs);
  sweep.unref();

  return {
    /** Ném 429 nếu `key` đã vượt giới hạn trong cửa sổ hiện tại. */
    hit(key) {
      if (limit <= 0) return;
      const t = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        bucket = { count: 0, resetAt: t + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (bucket.count > limit) {
        const retryAfter = Math.ceil((bucket.resetAt - t) / 1000);
        throw tooMany(`Thao tác quá nhanh, vui lòng thử lại sau ${retryAfter} giây`, { retry_after: retryAfter });
      }
    },
    stop() {
      clearInterval(sweep);
    },
  };
}
