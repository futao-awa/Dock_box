import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import type { NativeStatus, Settings } from '../shared/model';

export class NativeBridge extends EventEmitter {
  private process?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { resolve: (x: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  status: NativeStatus = { available: false, message: '正在连接 Windows 桌面…', desktopHidden: false, taskbarSupported: true };
  constructor(private path: string) { super(); }
  async start(): Promise<void> {
    if (process.platform !== 'win32' || !existsSync(this.path)) {
      this.status.message = 'Windows 原生桥接未安装，系统美化功能不可用。'; return;
    }
    await new Promise<void>((resolve) => {
      const child = spawn(this.path, [], { windowsHide: true, stdio: 'pipe' }); this.process = child;
      const timeout = setTimeout(() => { this.status.message = 'Windows 桥接连接超时。'; child.kill(); resolve(); }, 8000);
      child.on('error', error => { clearTimeout(timeout); this.status.message = error.message; resolve(); });
      child.on('exit', () => {
        clearTimeout(timeout); this.status.available = false; this.status.message = 'Windows 桥接已停止，系统效果已释放。';
        for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(this.status.message)); }
        this.pending.clear(); this.emit('status', this.status); resolve();
      });
      child.stderr.on('data', data => console.error('[native]', String(data).slice(0, 1000)));
      createInterface({ input: child.stdout }).on('line', line => {
        try {
          const message = JSON.parse(line);
          if (message.ready) { clearTimeout(timeout); this.status = { available: true, message: 'Windows 桌面服务已连接', desktopHidden: !!message.desktopHidden, taskbarSupported: true }; resolve(); }
          if (message.eventName === 'desktopVisibility') { this.status.desktopHidden = !!message.hidden; this.emit('desktopVisibility', !!message.hidden); }
          if (message.eventName === 'usbDrives') this.emit('usbDrives', message.drives);
          const entry = this.pending.get(message.id);
          if (entry) { clearTimeout(entry.timer); this.pending.delete(message.id); message.ok ? entry.resolve(message) : entry.reject(new Error(message.error || 'Windows 操作失败')); }
        } catch (error) { console.error('[native protocol]', error); }
      });
    });
  }
  async request(command: string, data: Record<string, unknown> = {}): Promise<any> {
    if (!this.process || !this.status.available) throw new Error(this.status.message);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Windows 桌面操作超时')); }, command === 'apps' ? 45000 : 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.process!.stdin.write(JSON.stringify({ ...data, id, command }) + '\n', error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); } });
    });
  }
  async apply(settings: Settings) {
    if (!this.status.available) return;
    const result = await this.request('apply', { settings });
    this.status.desktopHidden = !!result.desktopHidden;
    this.status.taskbarSupported = !!result.taskbarSupported;
    this.status.message = this.status.taskbarSupported ? 'Windows 桌面服务已连接' : '任务栏接口未响应，请确认 Windows 资源管理器已启动后重试。';
  }
  async stop() {
    if (!this.process) return;
    try { if (this.status.available) await this.request('restore'); } catch { }
    // Closing stdin also restores the desktop if Electron crashes or is force-closed.
    this.process.stdin.end();
  }
}
