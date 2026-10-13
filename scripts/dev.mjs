import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import electron from 'electron';
await import('./build-desktop.mjs');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit', windowsHide: true });
let ready = false;
for (let i = 0; i < 100; i++) { try { const response = await fetch('http://127.0.0.1:5173'); if (response.ok) { ready = true; break; } } catch {} await setTimeout(100); }
if (!ready) { vite.kill(); throw new Error('Vite server did not start.'); }
const env = { ...process.env, DOCK_BOX_DEV_URL: 'http://127.0.0.1:5173' }; delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(electron, ['.'], { stdio: 'inherit', env, windowsHide: true });
const cleanup = () => { app.kill(); vite.kill(); };
process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup); app.on('exit', () => { vite.kill(); });
