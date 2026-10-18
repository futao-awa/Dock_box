import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AppCategory, InstalledApp } from '../shared/model';

export interface AppEntry {
  name: string; target: string; resolvedTarget?: string; resolvedArguments?: string; workingDirectory?: string;
  appId?: string; icon?: string; source: string; available?: string;
}
export function appIdentity(entry: AppEntry) {
  const target = (entry.appId?.includes('!') ? `shell:AppsFolder\\${entry.appId}` : entry.resolvedTarget || entry.target).replaceAll('/', '\\').toLowerCase();
  return `${target}\0${entry.resolvedArguments?.trim() || ''}`;
}
export function categorizeApp(entry: AppEntry): AppCategory {
  const target = entry.resolvedTarget || entry.target;
  if (entry.available === 'false' || !target) return 'unavailable';
  if (/^https?:/i.test(target) || /\.url$/i.test(entry.target)) return 'website';
  if (/卸载|uninstall|unins\d*|帮助|help\b|readme|说明|文档|documentation|release notes|更新日志|report a problem|bug ?report|_cache_/i.test(`${entry.name} ${path.win32.basename(target)}`) || /\.(chm|pdf|txt|html?|msi)$/i.test(target)) return 'utility';
  if (/管理工具|安全策略|注册表|事件查看|计划任务|磁盘清理|服务$|组件服务|资源监视|系统配置|控制面板|control panel|administrative|management console|disk cleanup|registry editor|event viewer|services\b/i.test(entry.name) || /\.(msc|cpl)$/i.test(target)) return 'system';
  if (!/\.exe$/i.test(target) && !/^shell:AppsFolder\\[\w.!{}-]+$/i.test(target)) return 'utility';
  return 'application';
}
export function buildAppLibrary(entries: AppEntry[]): InstalledApp[] {
  const apps = new Map<string, { entry: AppEntry; app: InstalledApp }>();
  for (const entry of entries) {
    if (!entry.name?.trim() || !entry.target || /^ms-resource:/i.test(entry.name)) continue;
    const key = appIdentity(entry), category = categorizeApp(entry);
    const existing = apps.get(key);
    // Keep distinct programs with the same name, and keep argument-specific shortcuts.
    if (existing) {
      if (!existing.app.icon && entry.icon) existing.app.icon = entry.icon;
      continue;
    }
    const app: InstalledApp = {
      id: `app-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`,
      name: entry.name.trim(), kind: category === 'website' && /^https?:/i.test(entry.resolvedTarget || '') ? 'url' : 'app',
      target: category === 'website' && /^https?:/i.test(entry.resolvedTarget || '') ? entry.resolvedTarget! : entry.target,
      glyph: category === 'website' ? 'globe' : 'box', color: '#658a87', icon: entry.icon || undefined,
      category, source: entry.source, detail: entry.resolvedTarget || entry.target,
    };
    apps.set(key, { entry, app });
  }
  return [...apps.values()].map(value => value.app).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
