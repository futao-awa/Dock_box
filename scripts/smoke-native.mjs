import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

// Optional interactive Windows check: briefly toggle desktop icons, then restore.
// It never applies taskbar, startup or corner settings. Run after npm run build.
async function connect() {
  const child = spawn(path.resolve('resources/native/DockBox.Native.exe'), [], { windowsHide: true, stdio: 'pipe' });
  const pending = new Map();
  let sequence = 0, ready;
  const initialized = new Promise((resolve, reject) => {
    ready = resolve;
    child.once('error', reject);
  });
  child.stderr.on('data', data => process.stderr.write(data));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    const message = JSON.parse(line);
    if (message.ready) ready(message);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const wait = promise => Promise.race([promise, delay(8000).then(() => { throw new Error('Native bridge timed out'); })]);
  const initial = await wait(initialized);
  return {
    initial,
    request: async command => {
      const id = ++sequence;
      const response = new Promise(resolve => pending.set(id, resolve));
      child.stdin.write(JSON.stringify({ id, command }) + '\n');
      const message = await wait(response);
      assert.equal(message.ok, true, message.error);
      return message;
    },
    close: async () => {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.stdin.end();
      await wait(exited);
      lines.close();
    },
  };
}

const first = await connect();
try {
  const toggled = await first.request('toggleDesktop');
  assert.equal(toggled.desktopHidden, !first.initial.desktopHidden);
  await delay(2800);
  assert.equal((await first.request('status')).desktopHidden, toggled.desktopHidden, 'The refresh timer reversed the requested visibility');
  await first.request('restore');
  assert.equal((await first.request('status')).desktopHidden, first.initial.desktopHidden);
  console.log('PASS: icon visibility persists through refresh and restores explicitly');
} finally {
  await first.close();
}

const eof = await connect();
try { await eof.request('toggleDesktop'); } finally { await eof.close(); }
const verification = await connect();
try {
  assert.equal(verification.initial.desktopHidden, first.initial.desktopHidden);
  console.log('PASS: closing the Electron input pipe restores desktop icons');
} finally { await verification.close(); }
