import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import sharp from 'sharp';
import { createTestApp } from './helpers.js';

/** Mã hoá tài liệu đúng như frontend: base64(gzip(JSON)). */
const zip = (value) => zlib.gzipSync(Buffer.from(JSON.stringify(value))).toString('base64');
const unzip = (encoded) => JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));

const page = (text = 'xin chào') => ({
  id: 'trang-1',
  version: '6.4.1',
  zoom: 0.5,
  width: 540,
  height: 960,
  clip: 2,
  workSpace: { fillType: 0, left: 0, top: 0, angle: 0, scaleX: 1, scaleY: 1 },
  objects: [{ id: 'WorkSpaceDrawType', type: 'Rect' }, { id: 'chu', type: 'Textbox', text }],
});
const doc = (text) => ({ schema: 1, pages: [page(text)], meta: {} });

describe('thiết kế: tạo, đọc, lưu', () => {
  let t;
  let an;
  let binh;
  before(async () => {
    t = createTestApp();
    an = await t.signUp('an@example.com');
    binh = await t.signUp('binh@example.com');
  });
  after(() => t.cleanup());

  test('cần đăng nhập', async () => {
    assert.equal((await t.api('GET', '/api/design/designs')).status, 401);
    assert.equal((await t.api('POST', '/api/design/designs', { body: { data: zip(doc()) } })).status, 401);
  });

  test('tạo rồi đọc lại đúng nội dung; kích thước tính theo zoom', async () => {
    const created = await t.api('POST', '/api/design/designs', {
      token: an.token,
      body: { title: '  Poster giải cờ  ', data: zip(doc('Giải cờ vua mùa hè')) },
    });
    assert.equal(created.status, 200);
    const design = created.body.data;
    assert.equal(design.title, 'Poster giải cờ');
    assert.equal(design.revision, 1);
    assert.equal(design.page_count, 1);
    assert.equal(design.width, 1080); // 540 / 0.5
    assert.equal(design.height, 1920);

    const fetched = await t.api('GET', `/api/design/designs/${design.id}`, { token: an.token });
    assert.equal(unzip(fetched.body.data.data).pages[0].objects[1].text, 'Giải cờ vua mùa hè');
  });

  test('chấp nhận dạng cũ: một trang đơn và mảng trang', async () => {
    for (const payload of [page(), [page(), page()]]) {
      const res = await t.api('POST', '/api/design/designs', { token: an.token, body: { data: zip(payload) } });
      assert.equal(res.status, 200);
      const fetched = await t.api('GET', `/api/design/designs/${res.body.data.id}`, { token: an.token });
      const stored = unzip(fetched.body.data.data);
      assert.equal(stored.schema, 1);
      assert.equal(stored.pages.length, Array.isArray(payload) ? 2 : 1);
      assert.equal(res.body.data.title, 'Thiết kế chưa đặt tên');
    }
  });

  test('dữ liệu hỏng bị từ chối với 400', async () => {
    const cases = [
      'khong-phai-base64-gzip',
      Buffer.from('khong phai gzip').toString('base64'),
      zlib.gzipSync(Buffer.from('{khong phai json')).toString('base64'),
      zip({ pages: [] }),
      zip({ pages: [{ khong: 'co objects' }] }),
      zip('chuoi'),
    ];
    for (const data of cases) {
      const res = await t.api('POST', '/api/design/designs', { token: an.token, body: { data } });
      assert.equal(res.status, 400, `phải từ chối: ${data.slice(0, 20)}`);
      assert.equal(res.body.error, 'invalid_document');
    }
  });

  test('thiết kế của người khác coi như không tồn tại (404), kể cả khi sửa/xoá', async () => {
    const mine = (await t.api('POST', '/api/design/designs', { token: an.token, body: { data: zip(doc()) } })).body.data;
    const url = `/api/design/designs/${mine.id}`;
    assert.equal((await t.api('GET', url, { token: binh.token })).status, 404);
    assert.equal((await t.api('PATCH', url, { token: binh.token, body: { title: 'chiếm' } })).status, 404);
    assert.equal((await t.api('DELETE', url, { token: binh.token })).status, 404);
    assert.equal((await t.api('POST', `${url}/duplicate`, { token: binh.token })).status, 404);
    assert.equal((await t.api('GET', `${url}/versions`, { token: binh.token })).status, 404);
    assert.equal((await t.api('GET', '/api/design/designs/khong-ton-tai', { token: an.token })).status, 404);
    // Danh sách của Bình không có thiết kế của An.
    const list = await t.api('GET', '/api/design/designs', { token: binh.token });
    assert.equal(list.body.data.total, 0);
    assert.equal((await t.api('GET', url, { token: an.token })).body.data.title, mine.title);
  });

  test('khoá lạc quan: lưu với revision cũ trả 409 kèm revision hiện tại, không ghi đè', async () => {
    const design = (await t.api('POST', '/api/design/designs', { token: an.token, body: { data: zip(doc('gốc')) } })).body.data;
    const url = `/api/design/designs/${design.id}`;

    const missing = await t.api('PATCH', url, { token: an.token, body: { data: zip(doc('x')) } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, 'missing_base_revision');

    // Tab A lưu thành công.
    const tabA = await t.api('PATCH', url, { token: an.token, body: { data: zip(doc('tab A')), base_revision: 1 } });
    assert.equal(tabA.status, 200);
    assert.equal(tabA.body.data.revision, 2);

    // Tab B vẫn cầm revision 1.
    const tabB = await t.api('PATCH', url, { token: an.token, body: { data: zip(doc('tab B')), base_revision: 1 } });
    assert.equal(tabB.status, 409);
    assert.equal(tabB.body.error, 'revision_conflict');
    assert.equal(tabB.body.data.current.revision, 2);

    const stored = unzip((await t.api('GET', url, { token: an.token })).body.data.data);
    assert.equal(stored.pages[0].objects[1].text, 'tab A');

    // Đổi tên và gắn sao không cần revision và không làm tăng revision.
    const renamed = await t.api('PATCH', url, { token: an.token, body: { title: 'Tên mới', starred: true } });
    assert.equal(renamed.status, 200);
    assert.deepEqual(
      { title: renamed.body.data.title, starred: renamed.body.data.starred, revision: renamed.body.data.revision },
      { title: 'Tên mới', starred: true, revision: 2 },
    );
  });

  test('danh sách: tìm kiếm, lọc gắn sao, phân trang, không kèm tài liệu', async () => {
    const list = await t.api('GET', '/api/design/designs?size=2&page=1', { token: an.token });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.items.length, 2);
    assert.ok(list.body.data.total >= 5);
    assert.equal('data' in list.body.data.items[0], false);

    const found = await t.api('GET', `/api/design/designs?q=${encodeURIComponent('giải cờ')}`, { token: an.token });
    assert.equal(found.body.data.total, 1);
    const starred = await t.api('GET', '/api/design/designs?starred=1', { token: an.token });
    assert.equal(starred.body.data.total, 1);
    assert.equal(starred.body.data.items[0].title, 'Tên mới');
    assert.equal((await t.api('GET', '/api/design/designs?size=9999', { token: an.token })).status, 400);
  });
});

describe('thiết kế: thùng rác và nhân bản', () => {
  let t;
  let an;
  let design;
  before(async () => {
    t = createTestApp({ TRASH_RETENTION_DAYS: '30' });
    an = await t.signUp('an@example.com');
    design = (await t.api('POST', '/api/design/designs', { token: an.token, body: { title: 'Gốc', data: zip(doc()) } })).body.data;
  });
  after(() => t.cleanup());

  test('nhân bản tạo thiết kế độc lập, bắt đầu lại từ revision 1', async () => {
    const copy = await t.api('POST', `/api/design/designs/${design.id}/duplicate`, { token: an.token });
    assert.equal(copy.status, 200);
    assert.equal(copy.body.data.title, 'Bản sao của Gốc');
    assert.equal(copy.body.data.revision, 1);
    assert.notEqual(copy.body.data.id, design.id);
  });

  test('xoá = chuyển vào thùng rác; không sửa được; khôi phục lại được', async () => {
    const url = `/api/design/designs/${design.id}`;
    assert.equal((await t.api('DELETE', `${url}?permanent=1`, { token: an.token })).body.error, 'not_in_trash');
    assert.equal((await t.api('DELETE', url, { token: an.token })).status, 200);

    const live = await t.api('GET', '/api/design/designs', { token: an.token });
    assert.equal(live.body.data.items.some((item) => item.id === design.id), false);
    const trashed = await t.api('GET', '/api/design/designs?trashed=1', { token: an.token });
    assert.equal(trashed.body.data.items[0].id, design.id);

    const save = await t.api('PATCH', url, { token: an.token, body: { data: zip(doc('x')), base_revision: 1 } });
    assert.equal(save.status, 409);
    assert.equal(save.body.error, 'design_trashed');

    const restored = await t.api('POST', `${url}/restore`, { token: an.token });
    assert.equal(restored.body.data.trashed_at, null);
  });

  test('xoá hẳn, dọn thùng rác, và tự dọn theo số ngày', async () => {
    const make = async (title) =>
      (await t.api('POST', '/api/design/designs', { token: an.token, body: { title, data: zip(doc()) } })).body.data;
    const a = await make('A');
    const b = await make('B');
    const c = await make('C');
    for (const item of [a, b, c]) await t.api('DELETE', `/api/design/designs/${item.id}`, { token: an.token });

    assert.equal((await t.api('DELETE', `/api/design/designs/${a.id}?permanent=1`, { token: an.token })).status, 200);
    assert.equal((await t.api('GET', `/api/design/designs/${a.id}`, { token: an.token })).status, 404);

    // B nằm trong thùng rác 31 ngày, C mới 1 ngày.
    const day = 24 * 60 * 60_000;
    t.db.prepare('UPDATE designs SET trashed_at = ? WHERE id = ?').run(Date.now() - 31 * day, b.id);
    t.db.prepare('UPDATE designs SET trashed_at = ? WHERE id = ?').run(Date.now() - 1 * day, c.id);
    assert.equal(await t.ctx.designs.purgeExpiredTrash(), 1);
    assert.equal((await t.api('GET', `/api/design/designs/${b.id}`, { token: an.token })).status, 404);
    assert.equal((await t.api('GET', `/api/design/designs/${c.id}`, { token: an.token })).status, 200);

    const emptied = await t.api('DELETE', '/api/design/designs/trash', { token: an.token });
    assert.equal(emptied.body.data.deleted, 1);
    assert.equal((await t.api('GET', '/api/design/designs?trashed=1', { token: an.token })).body.data.total, 0);
  });
});

describe('thiết kế: lịch sử phiên bản', () => {
  let t;
  let an;
  let url;
  const save = (text, baseRevision) =>
    t.api('PATCH', url, { token: an.token, body: { data: zip(doc(text)), base_revision: baseRevision } });
  const versions = async () => (await t.api('GET', `${url}/versions`, { token: an.token })).body.data.items;

  before(async () => {
    t = createTestApp({ AUTO_VERSION_INTERVAL_MINUTES: '10', MAX_AUTO_VERSIONS: '3', MAX_MANUAL_VERSIONS: '2' });
    an = await t.signUp('an@example.com');
    const design = (await t.api('POST', '/api/design/designs', { token: an.token, body: { data: zip(doc('v1')) } })).body.data;
    url = `/api/design/designs/${design.id}`;
  });
  after(() => t.cleanup());

  test('lần lưu đầu chụp lại bản cũ; các lần lưu trong 10 phút không chụp thêm', async () => {
    assert.equal((await save('v2', 1)).status, 200);
    let items = await versions();
    assert.equal(items.length, 1);
    assert.equal(items[0].is_auto, true);
    assert.equal(items[0].revision, 1);

    assert.equal((await save('v3', 2)).status, 200);
    assert.equal((await versions()).length, 1);

    // Bản chụp chứa đúng nội dung CŨ (v1), không phải nội dung vừa lưu.
    items = await versions();
    const snapshot = await t.api('GET', `${url}/versions/${items[0].id}`, { token: an.token });
    assert.equal(unzip(snapshot.body.data.data).pages[0].objects[1].text, 'v1');
  });

  test('quá 10 phút thì chụp tiếp, và chỉ giữ số phiên bản tự động tối đa', async () => {
    let revision = 3;
    for (let i = 0; i < 5; i++) {
      // Giả lập 11 phút trôi qua kể từ bản chụp gần nhất.
      t.db.prepare('UPDATE design_versions SET created_at = created_at - ?').run(11 * 60_000);
      assert.equal((await save(`v${revision + 1}`, revision)).status, 200);
      revision += 1;
    }
    const items = await versions();
    assert.equal(items.length, 3); // MAX_AUTO_VERSIONS
    assert.ok(items.every((item) => item.is_auto));
    assert.deepEqual(items.map((item) => item.revision), [7, 6, 5]);
  });

  test('phiên bản thủ công: có nhãn, không bị tỉa, có giới hạn số lượng', async () => {
    const first = await t.api('POST', `${url}/versions`, { token: an.token, body: { label: 'Bản gửi khách' } });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.is_auto, false);
    assert.equal(first.body.data.label, 'Bản gửi khách');
    assert.equal((await t.api('POST', `${url}/versions`, { token: an.token, body: {} })).status, 200);
    const third = await t.api('POST', `${url}/versions`, { token: an.token, body: {} });
    assert.equal(third.body.error, 'limit_reached');
    assert.equal((await versions()).filter((item) => !item.is_auto).length, 2);
  });

  test('khôi phục phiên bản: nội dung quay về, revision tăng, trạng thái hiện tại được chụp lại trước', async () => {
    const before = await t.api('GET', url, { token: an.token });
    const currentText = unzip(before.body.data.data).pages[0].objects[1].text;
    const target = (await versions()).find((item) => item.is_auto && item.revision === 5);

    const restored = await t.api('POST', `${url}/versions/${target.id}/restore`, { token: an.token });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.data.revision, before.body.data.revision + 1);
    assert.equal(unzip(restored.body.data.data).pages[0].objects[1].text, 'v5');

    const items = await versions();
    const safety = items.find((item) => item.label === 'Trước khi khôi phục');
    assert.ok(safety);
    const safetyData = await t.api('GET', `${url}/versions/${safety.id}`, { token: an.token });
    assert.equal(unzip(safetyData.body.data.data).pages[0].objects[1].text, currentText);

    // Client đang cầm revision cũ phải nhận 409 khi lưu tiếp.
    assert.equal((await save('đè', before.body.data.revision)).status, 409);
  });
});

describe('thiết kế: giới hạn', () => {
  test('tài liệu vượt trần sau giải nén trả 413 (chặn bom nén)', async () => {
    const t = createTestApp({ MAX_DESIGN_DOCUMENT_BYTES: '65536' });
    try {
      const an = await t.signUp('an@example.com');
      // 2 MB ký tự lặp nén xuống còn vài KB.
      const bomb = zip({ pages: [{ ...page(), filler: 'a'.repeat(2_000_000) }] });
      assert.ok(Buffer.from(bomb, 'base64').length < 65536);
      const res = await t.api('POST', '/api/design/designs', { token: an.token, body: { data: bomb } });
      assert.equal(res.status, 413);
    } finally {
      t.cleanup();
    }
  });

  test('số thiết kế tối đa và hạn mức dung lượng', async () => {
    const t = createTestApp({ MAX_DESIGNS_PER_USER: '2', USER_STORAGE_QUOTA_BYTES: '1500' });
    try {
      const an = await t.signUp('an@example.com');
      const small = zip(doc('a'));
      assert.equal((await t.api('POST', '/api/design/designs', { token: an.token, body: { data: small } })).status, 200);

      // Tài liệu ngẫu nhiên khó nén, vượt hạn mức 1500 byte.
      const noise = Array.from({ length: 400 }, () => Math.random().toString(36).slice(2)).join('');
      const big = await t.api('POST', '/api/design/designs', { token: an.token, body: { data: zip(doc(noise)) } });
      assert.equal(big.status, 413);

      assert.equal((await t.api('POST', '/api/design/designs', { token: an.token, body: { data: small } })).status, 200);
      const third = await t.api('POST', '/api/design/designs', { token: an.token, body: { data: small } });
      assert.equal(third.body.error, 'limit_reached');
    } finally {
      t.cleanup();
    }
  });
});

describe('thumbnail và /media', () => {
  let t;
  let an;
  let design;
  before(async () => {
    t = createTestApp();
    an = await t.signUp('an@example.com');
    design = (await t.api('POST', '/api/design/designs', { token: an.token, body: { data: zip(doc()) } })).body.data;
  });
  after(() => t.cleanup());

  const upload = async (buffer, type = 'image/png') => {
    const form = new FormData();
    form.append('image', new Blob([buffer], { type }), 'thumb.png');
    return t.api('PUT', `/api/design/designs/${design.id}/thumbnail`, { token: an.token, raw: form });
  };

  test('ảnh được thu nhỏ thành webp 480px và phục vụ kèm header an toàn', async () => {
    const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#2B3990' } }).png().toBuffer();
    const res = await upload(png);
    assert.equal(res.status, 200);
    const mediaUrl = res.body.data.thumbnail;
    assert.match(mediaUrl, /^\/media\/thumbs\/[0-9a-f]{32}\.webp$/);

    const file = await t.app.request(mediaUrl);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/webp');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.match(file.headers.get('content-security-policy'), /sandbox/);
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    assert.deepEqual({ format: meta.format, width: meta.width, height: meta.height }, { format: 'webp', width: 480, height: 270 });

    // ETag: lần sau trình duyệt nhận 304.
    const cached = await t.app.request(mediaUrl, { headers: { 'If-None-Match': file.headers.get('etag') } });
    assert.equal(cached.status, 304);

    // Thumbnail mới thay thumbnail cũ, file cũ bị xoá.
    const second = await upload(png);
    assert.notEqual(second.body.data.thumbnail, mediaUrl);
    assert.equal((await t.app.request(mediaUrl)).status, 404);
  });

  test('file không phải ảnh bị từ chối dù khai là ảnh', async () => {
    const res = await upload(Buffer.from('<script>alert(1)</script>'), 'image/png');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_image');
  });

  test('/media không cho thoát khỏi thư mục media', async () => {
    for (const path of ['/media/../yft.db', '/media/%2e%2e/%2e%2e/package.json', '/media/thumbs/..%2f..%2fyft.db']) {
      const res = await t.app.request(path);
      assert.equal(res.status, 404, path);
    }
  });
});
