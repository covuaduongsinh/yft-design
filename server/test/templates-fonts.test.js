import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { createTestApp } from './helpers.js';

const zip = (value) => zlib.gzipSync(Buffer.from(JSON.stringify(value))).toString('base64');
const unzip = (encoded) => JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));

const docWith = (src) => ({
  schema: 1,
  meta: {},
  pages: [{ id: 'p1', zoom: 1, width: 1080, height: 1350, objects: [{ id: 'WorkSpaceDrawType', type: 'Rect' }, { id: 'anh', type: 'Image', src }] }],
});

describe('template', () => {
  let t;
  let user;
  let staff;
  let assetUrl;
  let templateId;
  before(async () => {
    t = createTestApp();
    user = await t.signUp('thuong@example.com');
    staff = await t.signUp('staff@example.com');
    t.setRole(staff.user.id, { staff: true });
    const form = new FormData();
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#2B3990' } }).png().toBuffer();
    form.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');
    assetUrl = (await t.api('POST', '/api/design/assets', { token: staff.token, raw: form })).body.data.url;
  });
  after(() => t.cleanup());

  test('danh sách rỗng lúc đầu, đúng dạng frontend đang đọc', async () => {
    for (const path of ['/api/design/template/info/pages?page=1&size=20', '/api/design/template/detail/pages?page=1&size=20']) {
      const res = await t.api('GET', path);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { total: 0, page: 1, size: 20, total_pages: 1, pages: 1, items: [] });
    }
  });

  test('chỉ staff đăng được template', async () => {
    const body = { title: 'Poster giải cờ', text: 'Mẫu poster dọc', data: zip(docWith(assetUrl)) };
    assert.equal((await t.api('POST', '/api/design/template', { body })).status, 401);
    assert.equal((await t.api('POST', '/api/design/template', { token: user.token, body })).status, 403);

    const res = await t.api('POST', '/api/design/template', { token: staff.token, body });
    assert.equal(res.status, 200);
    templateId = res.body.data.id;
    assert.equal(typeof templateId, 'number');
    assert.deepEqual(
      { title: res.body.data.title, w: res.body.data.width, h: res.body.data.height, pub: res.body.data.is_published },
      { title: 'Poster giải cờ', w: 1080, h: 1350, pub: true },
    );
  });

  test('ảnh của template là bản sao riêng: xoá ảnh gốc của người đăng, template vẫn còn ảnh', async () => {
    const res = await t.api('GET', `/api/design/template/data/${templateId}`);
    assert.equal(res.status, 200);
    const src = unzip(res.body.data.data).pages[0].objects[1].src;
    assert.match(src, /^\/media\/tpl\/[0-9a-f]{32}\.png$/);
    assert.notEqual(src, assetUrl);

    const assetId = assetUrl.match(/([0-9a-f]{32})/)[1];
    assert.equal((await t.api('DELETE', `/api/design/assets/${assetId}`, { token: staff.token })).status, 200);
    assert.equal((await t.app.request(assetUrl)).status, 404);
    assert.equal((await t.app.request(src)).status, 200);
  });

  test('người dùng khác (kể cả khách) mở được template đã đăng; lượt dùng được đếm', async () => {
    const guest = await t.api('GET', '/api/design/template/info/pages');
    assert.equal(guest.body.data.total, 1);
    assert.equal(guest.body.data.items[0].title, 'Poster giải cờ');
    assert.equal('data' in guest.body.data.items[0], false);

    await t.api('GET', `/api/design/template/data/${templateId}`, { token: user.token });
    const list = await t.api('GET', '/api/design/template/info/pages?all=1', { token: staff.token });
    assert.equal(list.body.data.items[0].use_count, 2);
  });

  test('ẩn template: người thường không thấy và không mở được, staff vẫn thấy', async () => {
    assert.equal((await t.api('PATCH', `/api/design/template/${templateId}`, { token: user.token, body: { is_published: false } })).status, 403);
    const hidden = await t.api('PATCH', `/api/design/template/${templateId}`, { token: staff.token, body: { is_published: false } });
    assert.equal(hidden.body.data.is_published, false);

    assert.equal((await t.api('GET', '/api/design/template/info/pages')).body.data.total, 0);
    // ?all=1 không có tác dụng với người không phải staff.
    assert.equal((await t.api('GET', '/api/design/template/info/pages?all=1', { token: user.token })).body.data.total, 0);
    assert.equal((await t.api('GET', `/api/design/template/data/${templateId}`, { token: user.token })).status, 404);
    assert.equal((await t.api('GET', '/api/design/template/info/pages?all=1', { token: staff.token })).body.data.total, 1);
    assert.equal((await t.api('GET', `/api/design/template/data/${templateId}`, { token: staff.token })).status, 200);
  });

  test('ảnh xem trước và xoá template dọn luôn file', async () => {
    const form = new FormData();
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#f5a623' } }).png().toBuffer();
    form.append('image', new Blob([png], { type: 'image/png' }), 'preview.png');
    const res = await t.api('PUT', `/api/design/template/${templateId}/preview`, { token: staff.token, raw: form });
    assert.match(res.body.data.preview, /^\/media\/tpl\/[0-9a-f]{32}\.webp$/);
    const meta = await sharp(Buffer.from(await (await t.app.request(res.body.data.preview)).arrayBuffer())).metadata();
    assert.deepEqual({ w: meta.width, h: meta.height }, { w: 800, h: 400 });

    const src = unzip((await t.api('GET', `/api/design/template/data/${templateId}`, { token: staff.token })).body.data.data).pages[0].objects[1].src;
    assert.equal((await t.api('DELETE', `/api/design/template/${templateId}`, { token: user.token })).status, 403);
    assert.equal((await t.api('DELETE', `/api/design/template/${templateId}`, { token: staff.token })).status, 200);
    assert.equal((await t.app.request(res.body.data.preview)).status, 404);
    assert.equal((await t.app.request(src)).status, 404);
  });
});

describe('font', () => {
  let t;
  let user;
  let staff;
  before(async () => {
    t = createTestApp({ MAX_FONT_BYTES: '4096' });
    user = await t.signUp('thuong@example.com');
    staff = await t.signUp('staff@example.com');
    t.setRole(staff.user.id, { staff: true });
  });
  after(() => t.cleanup());

  // 12 byte đầu của một file TTF hợp lệ là đủ cho việc nhận diện định dạng.
  const ttf = Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00]), Buffer.alloc(200, 1)]);
  const send = (token, buffer, fontname, filename = 'font.ttf') => {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    if (fontname !== undefined) form.append('fontname', fontname);
    return t.api('POST', '/api/design/font', { token, raw: form });
  };

  test('chỉ staff tải font lên; danh sách công khai', async () => {
    assert.equal((await send(undefined, ttf, 'Be Vietnam Pro')).status, 401);
    assert.equal((await send(user.token, ttf, 'Be Vietnam Pro')).status, 403);
    const res = await send(staff.token, ttf, '  Be   Vietnam Pro ');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.fontname, 'Be Vietnam Pro');
    assert.equal(res.body.data.format, 'truetype');

    const list = await t.api('GET', '/api/design/font/info');
    assert.equal(list.body.data.length, 1);
    assert.match(list.body.data[0].url, /^\/media\/fonts\/[0-9a-f]{32}\.ttf$/);
    const file = await t.app.request(list.body.data[0].url);
    assert.equal(file.headers.get('content-type'), 'font/ttf');
  });

  test('từ chối file không phải font, tên trùng, tên chứa ký tự chèn được vào CSS, file quá lớn', async () => {
    assert.equal((await send(staff.token, Buffer.from('<html>khong phai font</html>'), 'Gia Mao')).body.error, 'invalid_font');
    assert.equal((await send(staff.token, ttf, 'be vietnam pro')).body.error, 'font_exists');
    for (const name of ["x'; } body { display:none } /*", 'a"b', 'ten\\gach', '', 'url(http://xau)']) {
      assert.equal((await send(staff.token, ttf, name)).body.error, 'invalid_font_name', name);
    }
    const big = Buffer.concat([Buffer.from('OTTO'), Buffer.alloc(5000)]);
    assert.equal((await send(staff.token, big, 'Font To')).status, 413);
  });

  test('xoá font dọn luôn file', async () => {
    const font = (await t.api('GET', '/api/design/font/info')).body.data[0];
    assert.equal((await t.api('DELETE', `/api/design/font/${font.id}`, { token: user.token })).status, 403);
    assert.equal((await t.api('DELETE', `/api/design/font/${font.id}`, { token: staff.token })).status, 200);
    assert.equal((await t.app.request(font.url)).status, 404);
    assert.equal((await t.api('GET', '/api/design/font/info')).body.data.length, 0);
  });
});
