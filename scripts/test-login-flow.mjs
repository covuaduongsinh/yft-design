import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ARTIFACT_DIR = "C:\\Users\\duongsinh\\AppData\\Roaming\\orca\\antigravity-chat\\antigravity-acp\\brain\\22c9fb7f-82f9-4d5c-ba7a-e9d282e58f68";
const DEBUG_PORT = 9666;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('Khởi chạy Edge headless với remote debugging port', DEBUG_PORT);
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

  async function takeScreenshot(filePath) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    if (res && res.data) {
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      console.log('Đã lưu ảnh màn hình:', filePath);
    }
  }

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Chờ tải hoàn tất trang Home...');
  await sleep(3500);

  // Mở popup đăng nhập
  console.log('Mở popup đăng nhập bằng MouseEvent click...');
  await evaluate(`
    const btn = document.querySelector('.col-user button');
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);

  console.log('Chờ popup đăng nhập và ảnh captcha hiển thị...');
  await sleep(2000);

  // Chụp ảnh màn hình 1: Giao diện đăng nhập kèm ảnh Captcha
  const dialogScreenshotPath = path.join(ARTIFACT_DIR, 'login_dialog_with_captcha.png');
  await takeScreenshot(dialogScreenshotPath);

  // Điền form đăng nhập
  console.log('Điền thông tin tài khoản Admin & xác thực...');
  await evaluate(`
    function setInput(input, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const dialog = document.querySelector('.login-dialog');
    const inputs = dialog.querySelectorAll('input');
    if (inputs.length >= 3) {
      setInput(inputs[0], 'admin@yft.design');
      setInput(inputs[1], 'admin123');
      setInput(inputs[2], '8888');
    }

    const submitBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.trim() === '登录');
    if (submitBtn) submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);

  console.log('Chờ đăng nhập hoàn tất...');
  await sleep(2500);

  // Chụp ảnh màn hình 2: Trang Home sau khi đăng nhập thành công với badge Admin
  const homeLoggedInScreenshotPath = path.join(ARTIFACT_DIR, 'home_logged_in_admin.png');
  await takeScreenshot(homeLoggedInScreenshotPath);

  // Chuyển hướng sang Editor
  console.log('Chuyển hướng sang Editor canvas...');
  await send('Page.navigate', { url: 'http://localhost:5174/' });
  await sleep(4000);

  // Chụp ảnh màn hình 3: Editor canvas hiển thị trạng thái đăng nhập trên thanh header
  const editorLoggedInScreenshotPath = path.join(ARTIFACT_DIR, 'editor_logged_in_admin.png');
  await takeScreenshot(editorLoggedInScreenshotPath);

  console.log('Quy trình kiểm thử hoàn tất 100%!');
  ws.close();
  edge.kill();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
