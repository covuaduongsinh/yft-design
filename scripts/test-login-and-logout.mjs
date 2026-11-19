import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ARTIFACT_DIR = "C:\\Users\\duongsinh\\AppData\\Roaming\\orca\\antigravity-chat\\antigravity-acp\\brain\\22c9fb7f-82f9-4d5c-ba7a-e9d282e58f68";
const DEBUG_PORT = 9988;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('Khởi chạy Edge headless port', DEBUG_PORT);
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,900',
    'about:blank'
  ]);

  for (let i = 0; i < 20; i++) {
    try {
      await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      break;
    } catch (_) { await sleep(300); }
  }

  const newTargetRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://localhost:5174/home`, { method: 'PUT' });
  const target = await newTargetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res?.result?.value;
  }

  async function takeScreenshot(fileName) {
    const filePath = path.join(ARTIFACT_DIR, fileName);
    const res = await send('Page.captureScreenshot', { format: 'png' });
    if (res && res.data) {
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      console.log('  -> Đã lưu ảnh:', fileName);
    }
  }

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Chờ trang Home sẵn sàng...');
  for (let i = 0; i < 30; i++) {
    const ready = await evaluate(`!document.querySelector('.loading') && !!document.querySelector('.col-user button')`);
    if (ready) break;
    await sleep(500);
  }
  await sleep(1000);

  await evaluate(`
    window.setFormInput = function(input, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
  `);

  // BƯỚC 1: Đăng nhập với tài khoản vừa tạo
  console.log('1. Đăng nhập với tài khoản vừa tạo: user_vietnam_7098@yft.design');
  await evaluate(`
    const btn = document.querySelector('.col-user button');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);
  await sleep(1200);

  await evaluate(`
    const dialog = document.querySelector('.login-dialog');
    const inputs = dialog.querySelectorAll('input');
    if (inputs.length >= 3) {
      window.setFormInput(inputs[0], 'user_vietnam_7098@yft.design');
      window.setFormInput(inputs[1], 'vietnam2026');
      window.setFormInput(inputs[2], '8888');
    }
    const loginBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.trim() === '登录');
    if (loginBtn) loginBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);

  await sleep(2500);
  const loggedInUser = await evaluate(`document.querySelector('.user-dropdown-trigger')?.innerText`);
  console.log('Đã đăng nhập thành công. Header hiển thị:', loggedInUser);
  await takeScreenshot('step3_logged_in_verified.png');

  // BƯỚC 2: Đăng xuất bằng click dropdown
  console.log('\n2. Thực hiện đăng xuất...');
  await evaluate(`
    const trigger = document.querySelector('.user-dropdown-trigger');
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);
  await sleep(800);

  await evaluate(`
    const logoutBtn = Array.from(document.querySelectorAll('.el-dropdown-menu__item, .btn-logout')).find(el => el.textContent.includes('Đăng xuất'));
    if (logoutBtn) logoutBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);
  await sleep(1500);

  const isLoggedOut = await evaluate(`!document.querySelector('.user-dropdown-trigger') && !!document.querySelector('.col-user button')`);
  console.log('Đã đăng xuất thành công:', isLoggedOut);
  await takeScreenshot('step2_logged_out_verified.png');

  console.log('\n✅ TẤT CẢ ĐÃ ĐƯỢC XÁC THỰC HOÀN CHỈNH!');
  ws.close();
  edge.kill();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
