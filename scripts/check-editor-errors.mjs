import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ARTIFACT_DIR = "C:\\Users\\duongsinh\\AppData\\Roaming\\orca\\antigravity-chat\\antigravity-acp\\brain\\22c9fb7f-82f9-4d5c-ba7a-e9d282e58f68";
const DEBUG_PORT = 9777;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1600,900',
    'about:blank'
  ]);

  for (let i = 0; i < 20; i++) {
    try {
      await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      break;
    } catch (_) { await sleep(300); }
  }

  const pageRes = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://localhost:5174/`, { method: 'PUT' })).json();
  const ws = new WebSocket(pageRes.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  };

  await new Promise(r => ws.onopen = r);
  function call(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await call('Runtime.enable');
  await call('Page.enable');

  console.log('Chờ Editor render hoàn chỉnh...');
  await sleep(4000);

  const shot = await call('Page.captureScreenshot', { format: 'png' });
  if (shot && shot.data) {
    const savePath = path.join(ARTIFACT_DIR, 'editor_rendered_verified.png');
    fs.writeFileSync(savePath, Buffer.from(shot.data, 'base64'));
    console.log('Đã lưu ảnh chụp Editor:', savePath);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);
