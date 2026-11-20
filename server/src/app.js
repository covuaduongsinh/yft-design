import fs from 'node:fs';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { publicConfig } from './core/config.js';
import { errorHandler, notFoundHandler, ok } from './core/http.js';
import { assetRoutes } from './assets/routes.js';
import { createAssetService } from './assets/service.js';
import { createBackup } from './core/backup.js';
import { createMediaStore } from './core/media.js';
import { createRateLimiter } from './core/security.js';
import { spaHandler } from './core/static.js';
import { createStorageMeter } from './core/storage.js';
import { designRoutes } from './designs/routes.js';
import { createDesignService } from './designs/service.js';
import { fontRoutes } from './fonts/routes.js';
import { createFontService } from './fonts/service.js';
import { registerMattingRoutes } from './matting/routes.js';
import { createMattingService } from './matting/service.js';
import { stockListRoutes, stockRoutes } from './stock/routes.js';
import { createStockService } from './stock/service.js';
import { templateRoutes } from './templates/routes.js';
import { createTemplateService } from './templates/service.js';
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
  const templates = createTemplateService({ db, config, media });
  const fonts = createFontService({ db, config, media });
  const stock = createStockService({ db, config, media, assets, fetchImpl: deps.fetchImpl });
  const matting = createMattingService({ config, media, assets, fetchImpl: deps.fetchImpl });
  const backup = createBackup({ db, config });
  maintenance.push(() => stock.purgeCache(), () => backup.runIfDue());
  const ctx = {
    config, db, auth, guard, limiters, mailer, deps, maintenance, media, storage,
    designs, assets, templates, fonts, stock, matting, backup,
  };

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

  app.use('/api/design/template/*', limitBody(Math.ceil(config.maxDesignDocumentBytes * 1.4) + MiB));
  app.route('/api/design/template', templateRoutes(ctx));

  app.use('/api/design/font/*', limitBody(config.maxFontBytes + MiB));
  app.route('/api/design/font', fontRoutes(ctx));

  app.use('/api/design/stock/*', limitBody(config.maxUploadBytes + MiB));
  app.route('/api/design/stock', stockRoutes(ctx));
  app.route('/api/design/image', stockListRoutes(ctx, 'image'));
  app.route('/api/design/illustration', stockListRoutes(ctx, 'illustration'));

  // Ảnh nhúng gửi lên ở dạng base64 nên lớn hơn file gốc khoảng 1/3.
  app.use('/api/design/matting/*', limitBody(config.maxUploadBytes + MiB));
  app.use('/api/matting/*', limitBody(Math.ceil(config.maxUploadBytes * 1.4) + MiB));
  registerMattingRoutes(app, ctx);

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
