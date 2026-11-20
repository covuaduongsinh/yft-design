import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { createTestApp } from './helpers.js';

test('sao lưu: file tạo ra mở được và chứa đúng dữ liệu; bản quá hạn bị xoá', async () => {
  const t = createTestApp({ BACKUP_ENABLED: 'true', BACKUP_KEEP_DAYS: '7' });
  try {
    await t.signUp('an@example.com');
    fs.mkdirSync(t.config.backupDir, { recursive: true });
    const old = path.join(t.config.backupDir, 'yft-20200101-0000.db');
    fs.writeFileSync(old, 'cu');
    fs.utimesSync(old, new Date('2020-01-01'), new Date('2020-01-01'));

    const file = await t.ctx.backup.runIfDue();
    assert.ok(file && fs.existsSync(file));
    const copy = new Database(file, { readonly: true });
    assert.equal(copy.prepare('SELECT email FROM users').get().email, 'an@example.com');
    assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
    copy.close();
    assert.equal(fs.existsSync(old), false, 'bản sao lưu quá 7 ngày phải bị xoá');

    // Trong vòng 24 giờ không tạo thêm bản mới.
    assert.equal(await t.ctx.backup.runIfDue(), null);
  } finally {
    t.cleanup();
  }
});

test('sao lưu mặc định tắt', async () => {
  const t = createTestApp();
  try {
    assert.equal(await t.ctx.backup.runIfDue(), null);
    assert.equal(fs.existsSync(t.config.backupDir), false);
  } finally {
    t.cleanup();
  }
});
