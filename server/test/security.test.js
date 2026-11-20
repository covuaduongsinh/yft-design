import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { clientIp } from '../src/core/security.js';
import { resolveInside } from '../src/core/static.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/core/config.js';
import { openDb } from '../src/core/db.js';
import { migrate } from '../src/core/migrate.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('rà soát bảo mật bổ sung', () => {
  describe('resolveInside', () => {
    test('từ chối tham số không hợp lệ, null byte và thoát thư mục', () => {
      assert.equal(resolveInside('/app/data', null), null);
      assert.equal(resolveInside('/app/data', undefined), null);
      assert.equal(resolveInside('/app/data', 123), null);
      assert.equal(resolveInside('/app/data', 'a/b\0/c'), null);
      assert.equal(resolveInside('/app/data', 'a/b%00/c'), null);
      assert.equal(resolveInside('/app/data', '../../etc/passwd'), null);
      assert.equal(resolveInside('/app/data', '..%2f..%2fetc/passwd'), null);
    });
  });

  describe('clientIp', () => {
    test('chỉ lấy IP do proxy ngoài cùng ghi vào, chuẩn hoá IPv4-mapped IPv6', () => {
      const mockReq = (xff) => ({
        req: { header: (name) => (name.toLowerCase() === 'x-forwarded-for' ? xff : '') },
      });

      // 1 proxy hop: Traefik nối thêm client IP thật vào cuối
      const req1 = mockReq('1.2.3.4, 5.6.7.8');
      assert.equal(clientIp(req1, 1), '5.6.7.8');

      // Có tiền tố ::ffff: (IPv4 mapped)
      const req2 = mockReq('::ffff:192.168.1.1');
      assert.equal(clientIp(req2, 1), '192.168.1.1');
    });
  });

  describe('SSRF và stream body limit ở stock importRemote', () => {
    test('từ chối stream vượt giới hạn maxUploadBytes khi không có Content-Length', async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yft-sec-test-'));
      const config = loadConfig({
        DATA_DIR: dataDir,
        DB_FILE: ':memory:',
        AUTH_RATE_PER_MINUTE: '0',
        CAPTCHA_ENABLED: 'false',
        PIXABAY_API_KEY: 'test-key',
        MAX_UPLOAD_BYTES: '1000', // hạn mức 1000 byte
      });
      const db = openDb(':memory:');
      migrate(db, path.join(config.serverRoot, 'migrations'));

      // Mock fetch trả về stream lớn không có header Content-Length
      const bigChunk = new Uint8Array(600);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(bigChunk);
          controller.enqueue(bigChunk); // Tổng 1200 byte > 1000 byte
          controller.close();
        },
      });

      const fetchImpl = async () => new Response(stream, { headers: { 'content-type': 'image/png' } });
      const { app, close } = createApp({ config, db, deps: { fetchImpl } });

      try {
        const regRes = await app.request('/api/oauth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'sec@example.com', password: 'password-123' }),
        });
        const token = (await regRes.json()).data.access_token;

        const importRes = await app.request('/api/design/stock/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: 'https://pixabay.com/get/large.png' }),
        });

        assert.equal(importRes.status, 413);
        const body = await importRes.json();
        assert.equal(body.error, 'too_large');
      } finally {
        close();
        db.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    });
  });
});
