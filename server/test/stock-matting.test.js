import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/core/config.js';
import { openDb } from '../src/core/db.js';
import { migrate } from '../src/core/migrate.js';
import { createTestApp } from './helpers.js';

const png = (color, width = 600, height = 400) =>
  sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

/** Như createTestApp nhưng thay được `fetch` gọi ra ngoài bằng bản giả. */
function createAppWithFetch(env, fetchImpl) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yft-test-'));
  const config = loadConfig({ DATA_DIR: dataDir, DB_FILE: ':memory:', AUTH_RATE_PER_MINUTE: '0', CAPTCHA_ENABLED: 'false', ...env });
  const db = openDb(':memory:');
  migrate(db, path.join(config.serverRoot, 'migrations'));
  const { app, ctx, close } = createApp({ config, db, deps: { fetchImpl } });
  const api = async (method, url, { body, token, raw } = {}) => {
    const init = { method, headers: {} };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (raw !== undefined) init.body = raw;
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await app.request(url, init);
    return { status: response.status, body: await response.json() };
  };
  const signUp = async (email) => {
    const res = await api('POST', '/api/oauth/register', { body: { email, password: 'mat-khau-123' } });
    return { token: res.body.data.access_token, user: res.body.data.user };
  };
  const cleanup = () => {
    close();
    db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
  return { app, ctx, db, config, api, signUp, cleanup };
}

describe('kho ảnh nội bộ', () => {
  let t;
  let user;
  let staff;
  before(async () => {
    t = createTestApp();
    user = await t.signUp('thuong@example.com');
    staff = await t.signUp('staff@example.com');
    t.setRole(staff.user.id, { staff: true });
  });
  after(() => t.cleanup());

  const add = async (token, fields) => {
    const form = new FormData();
    form.append('file', new Blob([await png('#2B3990')], { type: 'image/png' }), 'anh.png');
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return t.api('POST', '/api/design/stock', { token, raw: form });
  };

  test('kho rỗng trả mảng rỗng ở cả bốn endpoint cũ, không cần đăng nhập', async () => {
    for (const path of ['image/page', 'image/category', 'illustration/page', 'illustration/category']) {
      const res = await t.api('GET', `/api/design/${path}?t=nature&page=1`);
      assert.equal(res.status, 200, path);
      assert.deepEqual(res.body.data, []);
    }
  });

  test('chỉ staff thêm ảnh; ảnh hiện đúng loại, đúng danh mục, đủ trường cho cả hai giao diện', async () => {
    assert.equal((await add(user.token, { kind: 'image', category: 'nature' })).status, 403);
    assert.equal((await add(staff.token, { kind: 'video', category: 'nature' })).status, 400);
    assert.equal((await add(staff.token, { kind: 'image', category: '../etc' })).status, 400);

    const res = await add(staff.token, { kind: 'image', category: 'nature', tags: 'cây, rừng' });
    assert.equal(res.status, 200);

    const hits = (await t.api('GET', '/api/design/image/page?t=nature&page=1')).body.data;
    assert.equal(hits.length, 1);
    const hit = hits[0];
    // Giao diện ảnh đọc preview/width/height; giao diện minh hoạ đọc previewURL/previewHeight.
    assert.match(hit.preview, /^\/media\/stock\/t\/[0-9a-f]{32}\.webp$/);
    assert.equal(hit.previewURL, hit.preview);
    assert.deepEqual([hit.width, hit.height, hit.previewHeight], [400, 267, 267]);
    assert.match(hit.largeImageURL, /^\/media\/stock\/[0-9a-f]{32}\.png$/);
    assert.equal(hit.needsImport, false);
    assert.equal((await t.app.request(hit.largeImageURL)).status, 200);

    assert.deepEqual((await t.api('GET', '/api/design/image/page?t=food')).body.data, []);
    assert.deepEqual((await t.api('GET', '/api/design/illustration/page?t=nature')).body.data, []);

    assert.equal((await t.api('DELETE', `/api/design/stock/${hit.id}`, { token: user.token })).status, 403);
    assert.equal((await t.api('DELETE', `/api/design/stock/${hit.id}`, { token: staff.token })).status, 200);
    assert.equal((await t.app.request(hit.largeImageURL)).status, 404);
  });

  test('nhập ảnh ngoài bị từ chối khi chưa bật Pixabay', async () => {
    const res = await t.api('POST', '/api/design/stock/import', {
      token: user.token,
      body: { url: 'https://pixabay.com/get/abc.jpg' },
    });
    assert.equal(res.body.error, 'stock_disabled');
  });
});

describe('kho ảnh Pixabay (tuỳ chọn)', () => {
  let t;
  let user;
  const calls = [];
  let image;
  before(async () => {
    image = await png('#0a0', 1280, 853);
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.hostname === 'pixabay.com' && url.pathname === '/api/') {
        return Response.json({
          hits: [{
            id: 42, tags: 'forest', previewURL: 'https://cdn.pixabay.com/p_150.jpg', previewWidth: 150, previewHeight: 100,
            webformatURL: 'https://pixabay.com/get/w_640.jpg', largeImageURL: 'https://pixabay.com/get/l_1280.jpg',
            imageWidth: 4000, imageHeight: 2667, user: 'tacgia', pageURL: 'https://pixabay.com/photos/42/',
          }],
        });
      }
      return new Response(image, { headers: { 'content-type': 'image/png', 'content-length': String(image.length) } });
    };
    t = createAppWithFetch({ PIXABAY_API_KEY: 'khoa-thu' }, fetchImpl);
    user = await t.signUp('thuong@example.com');
  });
  after(() => t.cleanup());

  test('kết quả được ánh xạ đúng tên trường và được cache (gọi Pixabay một lần)', async () => {
    const first = (await t.api('GET', '/api/design/image/page?t=nature&page=1')).body.data;
    assert.equal(first.length, 1);
    assert.deepEqual(
      { preview: first[0].preview, width: first[0].width, height: first[0].height, needsImport: first[0].needsImport },
      { preview: 'https://cdn.pixabay.com/p_150.jpg', width: 150, height: 100, needsImport: true },
    );
    await t.api('GET', '/api/design/image/page?t=nature&page=1');
    const searches = calls.filter((url) => url.pathname === '/api/');
    assert.equal(searches.length, 1);
    assert.equal(searches[0].searchParams.get('category'), 'nature');
    assert.equal(searches[0].searchParams.get('image_type'), 'photo');
    // Khoá API không được lộ ra cho client.
    assert.equal(JSON.stringify(first).includes('khoa-thu'), false);
  });

  test('nhập ảnh: tải về kho của người dùng; chỉ nhận địa chỉ Pixabay (chặn SSRF)', async () => {
    assert.equal((await t.api('POST', '/api/design/stock/import', { body: { url: 'https://pixabay.com/get/l_1280.jpg' } })).status, 401);
    for (const url of [
      'http://127.0.0.1:8788/api/health',
      'http://169.254.169.254/latest/meta-data/',
      'https://pixabay.com.evil.example/x.jpg',
      'https://evil.example/pixabay.com/x.jpg',
      'http://pixabay.com/get/x.jpg',
      'file:///etc/passwd',
      'khong-phai-url',
    ]) {
      const res = await t.api('POST', '/api/design/stock/import', { token: user.token, body: { url } });
      assert.equal(res.status, 400, url);
    }
    const before = calls.length;
    const res = await t.api('POST', '/api/design/stock/import', {
      token: user.token,
      body: { url: 'https://pixabay.com/get/l_1280.jpg' },
    });
    assert.equal(res.status, 200);
    assert.match(res.body.data.url, /^\/media\/a\/[0-9a-f]{32}\.png$/);
    assert.equal(res.body.data.width, 1280);
    assert.equal(calls.length, before + 1);
  });
});

describe('tách nền', () => {
  test('mặc định tắt', async () => {
    const t = createTestApp();
    try {
      const user = await t.signUp('thuong@example.com');
      const res = await t.api('POST', '/api/matting/url', { token: user.token, body: { image: 'data:image/png;base64,AAAA' } });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'matting_disabled');
      assert.equal((await t.api('GET', '/api/design/config')).body.data.features.matting, false);
    } finally {
      t.cleanup();
    }
  });

  describe('khi đã bật', () => {
    let t;
    let user;
    const sent = [];
    let failNext = false;
    before(async () => {
      const cutout = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
      const fetchImpl = async (input, init) => {
        sent.push({ url: String(input), size: init.body.get('file').size });
        if (failNext) {
          failNext = false;
          return new Response('loi', { status: 500 });
        }
        return new Response(cutout, { headers: { 'content-type': 'image/png' } });
      };
      t = createAppWithFetch({ MATTING_URL: 'http://rembg:7000/' }, fetchImpl);
      user = await t.signUp('thuong@example.com');
    });
    after(() => t.cleanup());

    test('cần đăng nhập', async () => {
      assert.equal((await t.api('POST', '/api/matting/url', { body: { image: 'data:image/png;base64,AAAA' } })).status, 401);
    });

    test('gửi file: gọi đúng dịch vụ, kết quả lưu thành ảnh của người dùng, trả về dạng cũ', async () => {
      const source = await png('#fff');
      const form = new FormData();
      form.append('image', new Blob([source], { type: 'image/png' }), 'anh.png');
      const res = await t.api('POST', '/api/design/matting/file', { token: user.token, raw: form });
      assert.equal(res.status, 200);
      assert.equal(res.body.code, 200);
      assert.match(res.body.resultImage, /^\/media\/a\/[0-9a-f]{32}\.png$/);
      assert.deepEqual(sent.at(-1), { url: 'http://rembg:7000/api/remove', size: source.length });
      assert.equal((await t.app.request(res.body.resultImage)).status, 200);
    });

    test('gửi chuỗi: nhận ảnh nhúng và ảnh /media của máy chủ, từ chối mọi URL khác (chặn SSRF)', async () => {
      const source = await png('#abc');
      const dataUrl = `data:image/png;base64,${source.toString('base64')}`;
      const fromData = await t.api('POST', '/api/matting/url', { token: user.token, body: { image: dataUrl } });
      assert.equal(fromData.status, 200);

      // Ảnh đã lưu, gửi dưới dạng đường dẫn tương đối hoặc URL đầy đủ của trang.
      const form = new FormData();
      form.append('file', new Blob([await png('#123')], { type: 'image/png' }), 'a.png');
      const asset = (await t.api('POST', '/api/design/assets', { token: user.token, raw: form })).body.data;
      for (const image of [asset.url, `https://design.example.com${asset.url}`]) {
        assert.equal((await t.api('POST', '/api/matting/url', { token: user.token, body: { image } })).status, 200, image);
      }

      const before = sent.length;
      for (const image of [
        'http://127.0.0.1:8788/api/health',
        'https://evil.example/anh.png',
        'http://169.254.169.254/latest/meta-data/',
        '/media/../yft.db',
        '/media/a/khong-ton-tai.png',
        'blob:http://localhost/abc',
        '/api/oauth/me',
      ]) {
        const res = await t.api('POST', '/api/matting/url', { token: user.token, body: { image } });
        assert.equal(res.status, 400, image);
      }
      assert.equal(sent.length, before, 'không được gọi dịch vụ tách nền cho nguồn bị từ chối');
    });

    test('dịch vụ lỗi trả 503, không tạo ảnh rác', async () => {
      const assetsBefore = t.db.prepare('SELECT count(*) AS n FROM assets').get().n;
      failNext = true;
      const res = await t.api('POST', '/api/matting/url', {
        token: user.token,
        body: { image: `data:image/png;base64,${(await png('#def')).toString('base64')}` },
      });
      assert.equal(res.status, 503);
      assert.equal(res.body.error, 'matting_unavailable');
      assert.equal(t.db.prepare('SELECT count(*) AS n FROM assets').get().n, assetsBefore);
    });
  });
});
