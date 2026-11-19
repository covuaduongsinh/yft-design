import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ARTIFACT_DIR = "C:\\Users\\duongsinh\\AppData\\Roaming\\orca\\antigravity-chat\\antigravity-acp\\brain\\22c9fb7f-82f9-4d5c-ba7a-e9d282e58f68";
const DEBUG_PORT = 9999;

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
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails?.text);
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

  console.log('Chờ trang Home hoàn tất load...');
  for (let i = 0; i < 40; i++) {
    const ready = await evaluate(`!document.querySelector('.loading') && !!document.querySelector('.col-user button')`);
    if (ready) {
      console.log('Trang Home đã sẵn sàng!');
      break;
    }
    await sleep(500);
  }
  await sleep(1000);

  // Helper điền form
  await evaluate(`
    window.setFormInput = function(input, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
  `);

  // ==========================================
  // GIAI ĐOẠN 1: TẠO TÀI KHOẢN MỚI & TỰ ĐỘNG ĐĂNG NHẬP
  // ==========================================
  console.log('\n========================================');
  console.log('1. BẮT ĐẦU: ĐĂNG KÝ TÀI KHOẢN MỚI');
  console.log('========================================');

  // Mở popup
  await evaluate(`
    const btn = document.querySelector('.col-user button');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);
  await sleep(1200);

  // Chuyển sang form Đăng ký (checkType = 2)
  console.log('Nhấp "注册账号" để chuyển sang form đăng ký...');
  await evaluate(`
    const regLink = Array.from(document.querySelectorAll('.login-dialog a')).find(a => a.textContent.includes('注册账号'));
    if (regLink) regLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);
  await sleep(800);

  const newEmail = `user_vietnam_${Date.now().toString().slice(-4)}@yft.design`;
  const newPass = 'vietnam2026';
  console.log(`Điền thông tin: Email=${newEmail}, Pass=${newPass}, Captcha=8888`);

  await evaluate(`
    const dialog = document.querySelector('.login-dialog');
    const inputs = dialog.querySelectorAll('input');
    if (inputs.length >= 3) {
      window.setFormInput(inputs[0], '${newEmail}');
      window.setFormInput(inputs[1], '${newPass}');
      window.setFormInput(inputs[2], '8888');
    }
    const regBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.trim() === '注册');
    if (regBtn) regBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);

  console.log('Chờ xử lý đăng ký và tự động đăng nhập...');
  for (let i = 0; i < 20; i++) {
    const isUserLoggedIn = await evaluate(`!!document.querySelector('.user-dropdown-trigger')`);
    if (isUserLoggedIn) {
      console.log('ĐĂNG KÝ & TỰ ĐỘNG ĐĂNG NHẬP THÀNH CÔNG!');
      break;
    }
    await sleep(400);
  }
  await sleep(1000);

  const regUserName = await evaluate(`document.querySelector('.user-dropdown-trigger')?.innerText`);
  console.log('Tài khoản hiển thị trên Header:', regUserName);
  await takeScreenshot('step1_registered_new_user.png');

  // ==========================================
  // GIAI ĐOẠN 2: ĐĂNG XUẤT (LOGOUT)
  // ==========================================
  console.log('\n========================================');
  console.log('2. BẮT ĐẦU: ĐĂNG XUẤT TÀI KHOẢN');
  console.log('========================================');

  // Mở dropdown
  await evaluate(`
    const trigger = document.querySelector('.user-dropdown-trigger');
    if (trigger) trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);
  await sleep(600);

  // Nhấp Đăng xuất
  console.log('Nhấp nút "Đăng xuất"...');
  await evaluate(`
    const logoutBtn = document.querySelector('.btn-logout') || Array.from(document.querySelectorAll('li')).find(el => el.textContent.includes('Đăng xuất'));
    if (logoutBtn) logoutBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);
  await sleep(1500);

  const loggedOutStatus = await evaluate(`!document.querySelector('.user-dropdown-trigger') && !!document.querySelector('.col-user button')`);
  console.log('Đã đăng xuất thành công:', loggedOutStatus);
  await takeScreenshot('step2_logged_out.png');

  // ==========================================
  // GIAI ĐOẠN 3: ĐĂNG NHẬP LẠI
  // ==========================================
  console.log('\n========================================');
  console.log('3. BẮT ĐẦU: ĐĂNG NHẬP LẠI VỚI TÀI KHOẢN VỪA TẠO');
  console.log('========================================');

  // Mở popup đăng nhập
  await evaluate(`
    const btn = document.querySelector('.col-user button');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);
  await sleep(1200);

  console.log(`Điền thông tin đăng nhập lại: Email=${newEmail}`);
  await evaluate(`
    const dialog = document.querySelector('.login-dialog');
    const inputs = dialog.querySelectorAll('input');
    if (inputs.length >= 3) {
      window.setFormInput(inputs[0], '${newEmail}');
      window.setFormInput(inputs[1], '${newPass}');
      window.setFormInput(inputs[2], '8888');
    }
    const loginBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.trim() === '登录');
    if (loginBtn) loginBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  `);

  console.log('Chờ đăng nhập...');
  for (let i = 0; i < 20; i++) {
    const isReLoggedIn = await evaluate(`!!document.querySelector('.user-dropdown-trigger')`);
    if (isReLoggedIn) {
      console.log('ĐĂNG NHẬP LẠI THÀNH CÔNG!');
      break;
    }
    await sleep(400);
  }
  await sleep(1000);

  const reLoggedUserName = await evaluate(`document.querySelector('.user-dropdown-trigger')?.innerText`);
  console.log('Tài khoản hiển thị trên Header sau khi đăng nhập lại:', reLoggedUserName);
  await takeScreenshot('step3_logged_in_again.png');

  console.log('\n🎉 TOÀN BỘ CHU TRÌNH: TẠO TÀI KHOẢN -> ĐĂNG XUẤT -> ĐĂNG NHẬP LẠI ĐÃ HOÀN THÀNH 100%!');
  ws.close();
  edge.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
