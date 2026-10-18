import path from 'node:path';
import { existsSync } from 'node:fs';
import type { DockItem } from '../shared/model';

export interface LaunchTarget { target: string; arguments?: string; workingDirectory?: string; url?: boolean }
export function resolveLaunch(item: DockItem, folders: Record<string, string>, environment: NodeJS.ProcessEnv = process.env): LaunchTarget {
  if (item.kind === 'url') {
    let url: URL;
    try { url = new URL(item.target.trim()); } catch { throw new Error('网址格式无效。'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('仅支持 http / https 网址。');
    return { target: url.toString(), url: true };
  }
  if (item.kind === 'builtin') {
    const system = path.win32.join(environment.SystemRoot || 'C:\\Windows', 'System32');
    const builtins: Record<string, string> = {
      explorer: path.win32.join(environment.SystemRoot || 'C:\\Windows', 'explorer.exe'),
      terminal: path.win32.join(system, 'cmd.exe'), notepad: path.win32.join(system, 'notepad.exe'),
      taskmgr: path.win32.join(system, 'Taskmgr.exe'), recycle: 'shell:RecycleBinFolder', ...folders,
      computer: 'shell:MyComputerFolder', windowsSettings: 'ms-settings:', controlpanel: path.win32.join(system, 'control.exe'), sound: path.win32.join(system, 'mmsys.cpl'),
    };
    if (!builtins[item.target]) throw new Error('未知的系统快捷操作。');
    return { target: builtins[item.target] };
  }
  let target = item.target.trim().replace(/^"(.*)"$/, '$1');
  target = target.replace(/%([^%]+)%/g, (token, key: string) => Object.entries(environment).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1] || token);
  if (/^shell:AppsFolder\\[\w.!{}-]+$/i.test(target)) return { target };
  if (!path.isAbsolute(target) || !existsSync(target)) throw new Error('应用或文件夹已移动，请右键图标，在图标设置中重新选择路径。');
  return { target, arguments: item.arguments, workingDirectory: item.workingDirectory || (item.kind === 'app' && /\.exe$/i.test(target) ? path.dirname(target) : undefined) };
}
