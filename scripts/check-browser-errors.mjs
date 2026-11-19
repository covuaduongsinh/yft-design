import { spawn } from 'node:child_process';

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const DEBUG_PORT = 9444;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    'about:blank'
  ]);

  for (let i = 0; i < 20; i++) {
    try {
      await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      break;
    } catch (_) { await sleep(300); }
  }

  const pageRes = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://localhost:5174/home`, { method: 'PUT' })).json();
  const ws = new WebSocket(pageRes.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[EXCEPTION]', msg.params.exceptionDetails?.text, msg.params.exceptionDetails?.exception?.description);
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

  await sleep(3000);

  // Click using MouseEvent
  console.log('Dispatching click...');
  await call('Runtime.evaluate', {
    expression: `
      const btn = document.querySelector('.col-user button');
      console.log('Button found in DOM:', !!btn);
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    `
  });

  await sleep(1500);

  const resDialog = await call('Runtime.evaluate', {
    expression: `
      const dialog = document.querySelector('.login-dialog');
      const overlay = document.querySelector('.el-overlay');
      ({
        dialogFound: !!dialog,
        dialogDisplay: dialog ? window.getComputedStyle(dialog).display : 'none',
        overlayDisplay: overlay ? window.getComputedStyle(overlay).display : 'none'
      })
    `,
    returnByValue: true
  });
  console.log('After click status:', resDialog?.result?.value);

  ws.close();
  edge.kill();
}

main().catch(console.error);
