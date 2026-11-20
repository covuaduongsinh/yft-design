import sharp from 'sharp';
import { badRequest } from './http.js';

// Không giữ cache file của libvips: server xử lý ảnh từ bộ nhớ, và cache giữ khoá file trên Windows.
sharp.cache(false);

const invalidImage = () => badRequest('invalid_image', 'File không phải ảnh hợp lệ hoặc định dạng không được hỗ trợ');

/** Định dạng ảnh được chấp nhận → phần mở rộng và kiểu MIME khi lưu. */
const FORMATS = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  webp: { ext: 'webp', mime: 'image/webp' },
  gif: { ext: 'gif', mime: 'image/gif' },
};

/**
 * Giải mã ảnh để xác nhận đúng là ảnh (không tin tên file hay Content-Type),
 * xoay theo EXIF, bỏ metadata và mã hoá lại ở chính định dạng đó.
 * @param {Buffer} input
 * @param {{ maxPixels: number }} options
 * @returns {Promise<{ data: Buffer, ext: string, mime: string, width: number, height: number }>}
 */
export async function processImage(input, { maxPixels }) {
  try {
    const source = sharp(input, { limitInputPixels: maxPixels, animated: true, failOn: 'error' });
    const meta = await source.metadata();
    const format = FORMATS[meta.format];
    if (!format) throw invalidImage();

    let pipeline = source.rotate(); // áp hướng EXIF trước khi metadata bị bỏ
    if (meta.format === 'jpeg') pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
    else if (meta.format === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
    else if (meta.format === 'webp') pipeline = pipeline.webp({ quality: 90 });
    else pipeline = pipeline.gif();

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    // Ảnh động: `info.height` là tổng chiều cao mọi khung hình, pageHeight mới là chiều cao một khung.
    return { data, ext: format.ext, mime: format.mime, width: info.width, height: info.pageHeight || info.height };
  } catch (err) {
    if (err && err.status) throw err;
    throw invalidImage();
  }
}

/**
 * Tạo ảnh thu nhỏ WebP, cạnh dài tối đa `side` px (không phóng to ảnh nhỏ).
 * @returns {Promise<Buffer>}
 */
export async function makeThumbnail(input, { side, maxPixels }) {
  try {
    return await sharp(input, { limitInputPixels: maxPixels, failOn: 'error' })
      .rotate()
      .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw invalidImage();
  }
}
