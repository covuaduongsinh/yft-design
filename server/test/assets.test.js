import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { createTestApp } from './helpers.js';

const zip = (value) => zlib.gzipSync(Buffer.from(JSON.stringify(value))).toString('base64');

const png = (color, width = 800, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

const docWith = (urls) => ({
  schema: 1,
  meta: {},
  pages: [
    {
      id: 'p1',
      zoom: 1,
      width: 100,
      height: 100,
      objects: [{ id: 'WorkSpaceDrawType', type: 'Rect' }, ...urls.map((src, i) => ({ id: `img${i}`, type: 'Image', src }))],
    },
  ],
});

function uploader(t) {
  return async (token, buffer, { name = 'anh.png', type = 'image/png', field = 'file' } = {}) => {
    const form = new FormData();
    form.append(field, new Blob([buffer], { type }), name);
    return t.api('POST', '/api/design/assets', { token, raw: form });
  };
}

describe('ảnh tải lên', () => {
  let t;
  let upload;
  let an;
  let binh;
  before(async () => {
    t = createTestApp();
    upload = uploader(t);
    an = await t.signUp('an@example.com');
    binh = await t.signUp('binh@example.com');
  });
  after(() => t.cleanup());

  test('cần đăng nhập', async () => {
    assert.equal((await upload(undefined, await png('#fff'))).status, 401);
    assert.equal((await t.api('GET', '/api/design/assets')).status, 401);
  });

  test('ảnh hợp lệ được lưu, có ảnh thu nhỏ, URL không lộ chủ sở hữu', async () => {
    const res = await upload(an.token, await png('#2B3990', 1200, 800), { name: 'logo duong sinh.png' });
    assert.equal(res.status, 200);
    const asset = res.body.data;
    assert.match(asset.url, /^\/media\/a\/[0-9a-f]{32}\.png$/);
    assert.match(asset.thumbnail, /^\/media\/a\/t\/[0-9a-f]{32}\.webp$/);
    assert.deepEqual({ w: asset.width, h: asset.height, mime: asset.mime, name: asset.name }, {
      w: 1200,
      h: 800,
      mime: 'image/png',
      name: 'logo duong sinh.png',
    });
    assert.equal(asset.url.includes(String(an.user.id) + '/'), false);

    const file = await t.app.request(asset.url);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.match(file.headers.get('content-security-policy'), /sandbox/);
    const thumb = await sharp(Buffer.from(await (await t.app.request(asset.thumbnail)).arrayBuffer())).metadata();
    assert.deepEqual({ f: thumb.format, w: thumb.width, h: thumb.height }, { f: 'webp', w: 320, h: 213 });
  });

  test('gửi lại đúng file thì nhận lại ảnh cũ, không tốn thêm hạn mức; người khác gửi thì thành ảnh riêng', async () => {
    const data = await png('#ff0000');
    const first = (await upload(an.token, data)).body.data;
    const usedAfterFirst = (await t.api('GET', '/api/design/assets/usage', { token: an.token })).body.data.used_bytes;
    const second = (await upload(an.token, data, { name: 'ten-khac.png' })).body.data;
    assert.equal(second.id, first.id);
    assert.equal((await t.api('GET', '/api/design/assets/usage', { token: an.token })).body.data.used_bytes, usedAfterFirst);

    const other = (await upload(binh.token, data)).body.data;
    assert.notEqual(other.id, first.id);
  });

  test('loại file xác định theo nội dung: giả đuôi .png và SVG đều bị từ chối', async () => {
    const cases = [
      [Buffer.from('<html><script>alert(document.cookie)</script></html>'), { name: 'anh.png', type: 'image/png' }],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { name: 'a.svg', type: 'image/svg+xml' }],
      [Buffer.from('MZ\x90\x00 day la file exe'), { name: 'anh.jpg', type: 'image/jpeg' }],
      [Buffer.alloc(0), { name: 'rong.png', type: 'image/png' }],
    ];
    for (const [buffer, options] of cases) {
      const res = await upload(an.token, buffer, options);
      assert.equal(res.status, 400, options.name);
      assert.equal(res.body.error, 'invalid_image');
    }
    assert.equal((await upload(an.token, await png('#000'), { field: 'sai-truong' })).status, 400);
  });

  test('JPEG có EXIF bị bỏ metadata; ảnh đuôi sai vẫn nhận đúng định dạng thật', async () => {
    const jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#0a0' } })
      .withExif({ IFD0: { Copyright: 'bi-mat', Artist: 'nguoi-chup' } })
      .jpeg()
      .toBuffer();
    assert.ok(jpeg.includes(Buffer.from('bi-mat')));
    // Khai là PNG nhưng nội dung là JPEG.
    const res = await upload(an.token, jpeg, { name: 'anh.png', type: 'image/png' });
    assert.equal(res.status, 200);
    assert.match(res.body.data.url, /\.jpg$/);
    assert.equal(res.body.data.mime, 'image/jpeg');
    const stored = Buffer.from(await (await t.app.request(res.body.data.url)).arrayBuffer());
    assert.equal(stored.includes(Buffer.from('bi-mat')), false);
    assert.equal(stored.includes(Buffer.from('nguoi-chup')), false);
  });

  test('danh sách và xoá chỉ thấy ảnh của chính mình', async () => {
    const mine = await t.api('GET', '/api/design/assets', { token: an.token });
    assert.ok(mine.body.data.total >= 3);
    const target = mine.body.data.items[0];
    assert.equal((await t.api('DELETE', `/api/design/assets/${target.id}`, { token: binh.token })).status, 404);
    assert.equal((await t.api('DELETE', `/api/design/assets/${target.id}`, { token: an.token })).status, 200);
    assert.equal((await t.app.request(target.url)).status, 404);
  });
});

describe('ảnh tải lên: giới hạn', () => {
  test('file quá lớn và ảnh quá nhiều điểm ảnh bị từ chối', async () => {
    const t = createTestApp({ MAX_UPLOAD_BYTES: '20000', MAX_IMAGE_PIXELS: '250000' });
    try {
      const an = await t.signUp('an@example.com');
      const upload = uploader(t);
      const noisy = await sharp(Buffer.from(Array.from({ length: 200 * 200 * 3 }, () => Math.floor(Math.random() * 256))), {
        raw: { width: 200, height: 200, channels: 3 },
      }).png().toBuffer();
      assert.ok(noisy.length > 20000);
      assert.equal((await upload(an.token, noisy)).status, 413);

      // Ảnh đơn sắc 1000x1000 chỉ vài KB nhưng có 1 triệu điểm ảnh, vượt trần 250.000.
      const huge = await png('#123456', 1000, 1000);
      assert.ok(huge.length < 20000);
      const res = await upload(an.token, huge);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'invalid_image');
    } finally {
      t.cleanup();
    }
  });

  test('vượt hạn mức thì từ chối và không để lại file', async () => {
    const t = createTestApp({ USER_STORAGE_QUOTA_BYTES: '3000' });
    try {
      const an = await t.signUp('an@example.com');
      const upload = uploader(t);
      const noisy = await sharp(Buffer.from(Array.from({ length: 80 * 80 * 3 }, () => Math.floor(Math.random() * 256))), {
        raw: { width: 80, height: 80, channels: 3 },
      }).png().toBuffer();
      assert.ok(noisy.length > 3000);
      const res = await upload(an.token, noisy);
      assert.equal(res.status, 413);
      assert.equal(t.db.prepare('SELECT count(*) AS n FROM assets').get().n, 0);
      const dir = path.join(t.config.mediaDir, 'a');
      const left = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((name) => /\.\w+$/.test(String(name))) : [];
      assert.deepEqual(left, []);
    } finally {
      t.cleanup();
    }
  });

  test('giới hạn tần suất tải lên theo người dùng', async () => {
    const t = createTestApp({ UPLOAD_RATE_PER_MINUTE: '2' });
    try {
      const an = await t.signUp('an@example.com');
      const upload = uploader(t);
      const statuses = [];
      for (const color of ['#100', '#200', '#300']) statuses.push((await upload(an.token, await png(color, 50, 50))).status);
      assert.deepEqual(statuses, [200, 200, 429]);
    } finally {
      t.cleanup();
    }
  });
});

describe('ảnh không còn ai dùng được tự dọn', () => {
  let t;
  let upload;
  let an;
  before(async () => {
    t = createTestApp({ AUTO_VERSION_INTERVAL_MINUTES: '0' });
    upload = uploader(t);
    an = await t.signUp('an@example.com');
  });
  after(() => t.cleanup());

  const exists = async (asset) => (await t.app.request(asset.url)).status === 200;

  test('ảnh được thiết kế hoặc phiên bản tham chiếu thì giữ; hết tham chiếu thì xoá', async () => {
    const a = (await upload(an.token, await png('#a00'))).body.data;
    const b = (await upload(an.token, await png('#0b0'))).body.data;
    const unused = (await upload(an.token, await png('#00c'))).body.data;

    const design = (
      await t.api('POST', '/api/design/designs', { token: an.token, body: { data: zip(docWith([a.url, b.url])) } })
    ).body.data;
    const url = `/api/design/designs/${design.id}`;

    // Trong thời gian chờ, ảnh chưa được dùng vẫn được giữ.
    assert.equal(await t.ctx.assets.purgeUnused(), 0);
    // Hết thời gian chờ: chỉ ảnh không ai dùng bị xoá.
    assert.equal(await t.ctx.assets.purgeUnused(-1), 1);
    assert.deepEqual([await exists(a), await exists(b), await exists(unused)], [true, true, false]);

    // Lưu tài liệu mới chỉ còn dùng ảnh a. Bản cũ (dùng a + b) được chụp thành phiên bản,
    // nên b vẫn phải được giữ để khôi phục phiên bản đó còn hiển thị đúng.
    const saved = await t.api('PATCH', url, { token: an.token, body: { data: zip(docWith([a.url])), base_revision: 1 } });
    assert.equal(saved.status, 200);
    assert.equal(await t.ctx.assets.purgeUnused(-1), 0);
    assert.equal(await exists(b), true);

    // Xoá hẳn thiết kế (kéo theo mọi phiên bản): cả hai ảnh hết người dùng.
    await t.api('DELETE', url, { token: an.token });
    await t.api('DELETE', `${url}?permanent=1`, { token: an.token });
    assert.equal(await t.ctx.assets.purgeUnused(-1), 2);
    assert.deepEqual([await exists(a), await exists(b)], [false, false]);
    assert.equal((await t.api('GET', '/api/design/assets/usage', { token: an.token })).body.data.used_bytes, 0);
  });

  test('nhân bản và khôi phục phiên bản giữ đúng tham chiếu ảnh', async () => {
    const a = (await upload(an.token, await png('#111'))).body.data;
    const b = (await upload(an.token, await png('#222'))).body.data;
    const design = (
      await t.api('POST', '/api/design/designs', { token: an.token, body: { data: zip(docWith([a.url])) } })
    ).body.data;
    const url = `/api/design/designs/${design.id}`;
    const copy = (await t.api('POST', `${url}/duplicate`, { token: an.token })).body.data;

    // Bản gốc chuyển sang dùng ảnh b; bản sao vẫn dùng a.
    await t.api('PATCH', url, { token: an.token, body: { data: zip(docWith([b.url])), base_revision: 1 } });
    // Xoá hẳn bản gốc: a vẫn còn vì bản sao đang dùng, b hết người dùng.
    await t.api('DELETE', url, { token: an.token });
    await t.api('DELETE', `${url}?permanent=1`, { token: an.token });
    assert.equal(await t.ctx.assets.purgeUnused(-1), 1);
    assert.deepEqual([await exists(a), await exists(b)], [true, false]);
    assert.equal((await t.api('GET', `/api/design/designs/${copy.id}`, { token: an.token })).status, 200);
  });

  test('file mồ côi trong thư mục media bị quét dọn', async () => {
    const dir = path.join(t.config.mediaDir, 'a');
    fs.mkdirSync(dir, { recursive: true });
    const orphan = path.join(dir, `${'f'.repeat(32)}.png`);
    fs.writeFileSync(orphan, 'rac');
    const kept = (await upload(an.token, await png('#333'))).body.data;
    assert.equal(await t.ctx.assets.sweepOrphanFiles(-1), 1);
    assert.equal(fs.existsSync(orphan), false);
    assert.equal(await exists(kept), true);
  });
});
