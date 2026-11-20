/**
 * Vỏ phản hồi chung của API: { code, msg, data }.
 * Thành công luôn là HTTP 200 + code 200. Lỗi dùng mã HTTP thật và lặp lại
 * mã đó trong `code`; `error` là mã máy đọc được, `msg` là câu cho người dùng.
 */
export function ok(c, data = null, msg = 'success') {
  return c.json({ code: 200, data, msg });
}

export class AppError extends Error {
  /**
   * @param {number} status mã HTTP
   * @param {string} error mã lỗi máy đọc, vd 'invalid_credentials'
   * @param {string} msg thông báo cho người dùng
   * @param {Record<string, unknown>} [extra] dữ liệu kèm theo (vd revision hiện tại khi 409)
   */
  constructor(status, error, msg, extra) {
    super(msg);
    this.status = status;
    this.error = error;
    this.extra = extra;
  }
}

export const badRequest = (error, msg, extra) => new AppError(400, error, msg, extra);
export const unauthorized = (msg = 'Vui lòng đăng nhập để tiếp tục') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Không tìm thấy dữ liệu') => new AppError(404, 'not_found', msg);
export const conflict = (error, msg, extra) => new AppError(409, error, msg, extra);
export const tooLarge = (msg = 'Dữ liệu gửi lên quá lớn') => new AppError(413, 'too_large', msg);
export const tooMany = (msg = 'Thao tác quá nhanh, vui lòng thử lại sau', extra) =>
  new AppError(429, 'too_many_requests', msg, extra);

/** Gắn vào app.onError: biến mọi lỗi thành vỏ phản hồi chung. */
export function errorHandler(err, c) {
  if (err instanceof AppError) {
    return c.json({ code: err.status, error: err.error, msg: err.message, data: err.extra ?? null }, err.status);
  }
  // Lỗi do Hono ném ra (vd body quá lớn) có sẵn status.
  if (err && typeof err.status === 'number' && err.status >= 400 && err.status < 500) {
    return c.json({ code: err.status, error: 'bad_request', msg: 'Yêu cầu không hợp lệ', data: null }, err.status);
  }
  console.error('[LỖI KHÔNG LƯỜNG TRƯỚC]', err);
  return c.json({ code: 500, error: 'server_error', msg: 'Lỗi hệ thống, vui lòng thử lại sau', data: null }, 500);
}

export function notFoundHandler(c) {
  return c.json({ code: 404, error: 'not_found', msg: `Endpoint không tồn tại: ${c.req.path}`, data: null }, 404);
}

/**
 * Đọc body JSON và kiểm tra bằng schema zod; lỗi trả 400 kèm tên trường sai.
 * @template T
 * @param {import('hono').Context} c
 * @param {import('zod').ZodType<T>} schema
 * @returns {Promise<T>}
 */
export async function readJson(c, schema) {
  let body;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest('invalid_json', 'Dữ liệu gửi lên không phải JSON hợp lệ');
  }
  return parse(schema, body);
}

/** @template T @param {import('zod').ZodType<T>} schema @returns {T} */
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.join('.') || 'body';
  // Thông báo mặc định của zod là tiếng Anh; chỉ giữ thông báo do schema tự đặt.
  const custom = issue.code !== 'invalid_type' && /[^\x00-\x7F]/.test(issue.message || '');
  const msg = custom ? issue.message : `Trường "${field}" bị thiếu hoặc không hợp lệ`;
  throw badRequest('invalid_input', msg, { field });
}
