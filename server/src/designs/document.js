import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { extractAssetIds } from '../assets/service.js';
import { badRequest, tooLarge } from '../core/http.js';

const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);

const MAX_PAGES = 300;
const MAX_OBJECTS_PER_PAGE = 20_000;

const invalid = (msg) => badRequest('invalid_document', msg);

/**
 * Chuẩn hoá tài liệu về dạng { schema: 1, pages: Template[], meta: {} }.
 * Chấp nhận cả một trang đơn lẻ và một mảng trang (dạng cũ của file JSON xuất ra).
 */
export function normalizeDocument(input) {
  let pages;
  let meta = {};
  if (Array.isArray(input)) pages = input;
  else if (input && typeof input === 'object' && Array.isArray(input.pages)) {
    pages = input.pages;
    if (input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta)) meta = input.meta;
  } else if (input && typeof input === 'object' && Array.isArray(input.objects)) pages = [input];
  else throw invalid('Tài liệu thiết kế không đúng định dạng');

  if (pages.length === 0) throw invalid('Tài liệu thiết kế phải có ít nhất một trang');
  if (pages.length > MAX_PAGES) throw invalid(`Tài liệu thiết kế không được vượt quá ${MAX_PAGES} trang`);

  for (const page of pages) {
    if (!page || typeof page !== 'object' || Array.isArray(page) || !Array.isArray(page.objects)) {
      throw invalid('Có trang không đúng định dạng');
    }
    if (page.objects.length > MAX_OBJECTS_PER_PAGE) throw invalid('Có trang chứa quá nhiều đối tượng');
  }
  return { schema: 1, pages, meta };
}

/** Kích thước thật (px) của trang đầu: store của frontend lưu width/height đã nhân zoom. */
function firstPageSize(pages) {
  const page = pages[0];
  const zoom = Number(page.zoom) > 0 ? Number(page.zoom) : 1;
  const width = Number(page.width) > 0 ? Number(page.width) / zoom : 0;
  const height = Number(page.height) > 0 ? Number(page.height) / zoom : 0;
  return { width: Math.round(width * 100) / 100, height: Math.round(height * 100) / 100 };
}

/**
 * Giải mã tài liệu do client gửi (base64 của gzip của JSON), kiểm tra và nén lại.
 * Trần `maxBytes` áp lên kích thước SAU giải nén để chặn "bom nén".
 * @returns {Promise<{ blob: Buffer, pageCount: number, width: number, height: number }>}
 */
export async function decodeDocument(encoded, maxBytes) {
  if (typeof encoded !== 'string' || encoded.length === 0) throw invalid('Thiếu dữ liệu tài liệu thiết kế');
  const compressed = Buffer.from(encoded, 'base64');
  if (compressed.length < 3 || compressed[0] !== 0x1f || compressed[1] !== 0x8b) {
    throw invalid('Dữ liệu tài liệu thiết kế không đúng định dạng nén');
  }

  let raw;
  try {
    raw = await gunzip(compressed, { maxOutputLength: maxBytes });
  } catch (err) {
    if (err && err.code === 'ERR_BUFFER_TOO_LARGE') {
      throw tooLarge(`Tài liệu thiết kế vượt quá ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    }
    throw invalid('Không giải nén được tài liệu thiết kế');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw invalid('Tài liệu thiết kế không phải JSON hợp lệ');
  }
  const document = normalizeDocument(parsed);
  const json = JSON.stringify(document);
  const blob = await gzip(Buffer.from(json, 'utf8'));
  return {
    blob,
    pageCount: document.pages.length,
    ...firstPageSize(document.pages),
    // Ảnh tải lên mà tài liệu này tham chiếu, để server biết ảnh nào còn được dùng.
    assetIds: extractAssetIds(json),
  };
}

/** Chuỗi gửi về client: base64 của đúng khối gzip đang lưu. */
export const encodeForClient = (blob) => Buffer.from(blob).toString('base64');
