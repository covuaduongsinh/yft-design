import fs from 'node:fs';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { publicConfig } from './core/config.js';
import { errorHandler, notFoundHandler, ok } from './core/http.js';
import { assetRoutes } from './assets/routes.js';
import { createAssetService } from './assets/service.js';
import { createMediaStore } from './core/media.js';
import { createRateLimiter } from './core/security.js';
import { spaHandler } from './core/static.js';
import { createStorageMeter } from './core/storage.js';
import { designRoutes } from './designs/routes.js';
import { createDesignService } from './designs/service.js';
import { createMailer } from './auth/mailer.js';
import { createAuthMiddleware } from './auth/middleware.js';
import { adminUserRoutes, authRoutes } from './auth/routes.js';
import { createAuthService } from './auth/service.js';

const MiB = 1024 * 1024;

/** Giới hạn kích thước body; trả 413 theo vỏ phản hồi chung. */
export const limitBody = (maxSize) =>
  bodyLimit({
    maxSize,
    onError: (c) => c.json({ code: 413, error: 'too_large', msg: 'Dữ liệu gửi lên quá lớn', data: null }, 413),
  });

/**
 * Dựng ứng dụng Hono. Tách khỏi index.js để test gọi thẳng `app.request()`.
 * @param {{ config: object, db: import('better-sqlite3').Database, deps?: object }} options
 */
export function createApp({ config, db, deps = {} }) {
  const mailer = deps.mailer ?? createMailer(config);
  const auth = createAuthService({ db, config, mailer, randomDigits: deps.randomDigits });
  const guard = createAuthMiddleware(auth);
  const limiters = {
    auth: createRateLimiter({ limit: config.authRatePerMinute }),
    upload: createRateLimiter({ limit: config.uploadRatePerMinute }),
  };
  const media = createMediaStore(config.mediaDir);
  const storage = createStorageMeter(db);
  const assets = createAssetService({ db, config, media, storage });
  const designs = createDesignService({ db, config, media, storage, assets });

  /** @type {Array<() => unknown>} tác vụ dọn dẹp định kỳ do từng module đăng ký */
  const maintenance = [
    () => designs.purgeExpiredTrash(),
    () => assets.purgeUnused(),
    () => assets.sweepOrphanFiles(),
  ];
  const ctx = { config, db, auth, guard, limiters, mailer, deps, maintenance, media, storage, designs, assets };

  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  app.get('/api/health', (c) =>
    c.json({ code: 200, status: 'ok', service: 'yft-design-server', timestamp: new Date().toISOString() }),
  );
  app.get('/api/design/config', (c) => ok(c, publicConfig(config)));

  app.use('/api/oauth/*', limitBody(MiB));
  app.use('/api/admin/*', limitBody(MiB));
  app.route('/api/oauth', authRoutes(ctx));
  app.route('/api/admin', adminUserRoutes(ctx));

  // Tài liệu gửi lên ở dạng base64 của gzip: lớn hơn dữ liệu nén khoảng 1/3.
  app.use('/api/design/designs/*', limitBody(Math.ceil(config.maxDesignDocumentBytes * 1.4) + MiB));
  app.route('/api/design/designs', designRoutes(ctx));

  app.use('/api/design/assets/*', limitBody(config.maxUploadBytes + MiB));
  app.route('/api/design/assets', assetRoutes(ctx));

  app.on(['GET', 'HEAD'], '/media/*', media.handler);

  // Tạm thời: danh sách template rỗng (giống server giả lập cũ) cho tới khi có module templates.
  app.get('/api/design/template/*', (c) =>
    ok(c, { total: 0, page: 1, total_pages: 1, size: 20, pages: 1, items: [] }),
  );

  if (config.staticDir && fs.existsSync(config.staticDir)) {
    const spa = spaHandler(config.staticDir);
    app.on(['GET', 'HEAD'], '*', (c) => {
      const pathname = new URL(c.req.url).pathname;
      if (pathname.startsWith('/api/') || pathname.startsWith('/media/')) return c.notFound();
      return spa(c);
    });
  }

  return {
    app,
    ctx,
    close() {
      limiters.auth.stop();
      limiters.upload.stop();
    },
  };
}
