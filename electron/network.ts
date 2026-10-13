import { session } from 'electron';
import { execFile } from 'node:child_process';

export function installNetworkGuard(blocked: () => boolean, devUrl?: string) {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: shouldBlockRequest(details.url, blocked(), devUrl) });
  });
}
export function shouldBlockRequest(url: string, blocked: boolean, devUrl?: string) {
  if (!blocked || !/^(https?|wss?|ftp):/i.test(url)) return false;
  if (devUrl) {
    const request = new URL(url), development = new URL(devUrl);
    if (['127.0.0.1', 'localhost', '[::1]'].includes(development.hostname) && request.hostname === development.hostname && request.port === development.port) return false;
  }
  return true;
}

// The helper only adds/removes executable-specific block rules. UAC stays under Windows control.
export async function setFirewall(helper: string, enabled: boolean, executables: string[]) {
  const quote = (value: string) => "'" + value.replace(/'/g, "''") + "'";
  if ([helper, ...executables].some(file => /["\r\n\0]/.test(file))) throw new Error('防火墙程序路径无效。');
  const args = [enabled ? '--firewall-enable' : '--firewall-disable', ...new Set(executables)].map(file => '"' + file + '"').join(' ');
  const script = `$ErrorActionPreference = 'Stop'; try { $firewallProcess = Start-Process -FilePath ${quote(helper)} -ArgumentList ${quote(args)} -Verb RunAs -WindowStyle Hidden -PassThru -Wait; exit $firewallProcess.ExitCode } catch { exit 1 }`;
  await new Promise<void>((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 120000 }, error => {
      if (error) reject(new Error('防火墙设置未完成：请允许 Windows 管理员授权，并确认 Windows 防火墙服务正在运行。'));
      else resolve();
    });
  });
}
