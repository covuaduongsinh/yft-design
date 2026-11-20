import { forbidden, unauthorized } from '../core/http.js';

function bearerToken(c) {
  const header = c.req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

/**
 * Các middleware kiểm quyền. Quyền luôn đọc từ CSDL ở mỗi request,
 * không tin bất kỳ cờ nào do trình duyệt gửi lên.
 */
export function createAuthMiddleware(auth) {
  const load = (c) => {
    const session = auth.authenticate(bearerToken(c));
    if (session) {
      c.set('user', session.user);
      c.set('tokenHash', session.tokenHash);
    }
    return session;
  };

  const requireUser = async (c, next) => {
    if (!load(c)) throw unauthorized();
    await next();
  };

  const optionalUser = async (c, next) => {
    load(c);
    await next();
  };

  const requireStaff = async (c, next) => {
    const session = load(c);
    if (!session) throw unauthorized();
    if (!session.user.is_staff && !session.user.is_superuser) throw forbidden();
    await next();
  };

  const requireSuperuser = async (c, next) => {
    const session = load(c);
    if (!session) throw unauthorized();
    if (!session.user.is_superuser) throw forbidden();
    await next();
  };

  return { requireUser, optionalUser, requireStaff, requireSuperuser };
}
