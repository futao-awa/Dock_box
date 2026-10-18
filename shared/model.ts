import { waveReserve } from './wave';
export type DockPosition = 'bottom' | 'top' | 'left' | 'right';
export type Theme = 'glass' | 'cloud' | 'midnight' | 'rose';
export type Glyph = 'folder' | 'browser' | 'code' | 'music' | 'image' | 'terminal' | 'settings' | 'trash' | 'game' | 'chat' | 'box' | 'files' | 'globe' | 'plus';
export interface DockItem {
  id: string; name: string; kind: 'app' | 'url' | 'folder' | 'group' | 'builtin' | 'separator';
  target: string; glyph: Glyph; color: string; icon?: string; children?: DockItem[];
  arguments?: string; workingDirectory?: string;
}
export interface Settings {
  position: DockPosition; displayId: string; iconSize: number; zoom: number; gap: number;
  edgeMargin: number; offset: number; magnification: number; magnifyRange: number;
  hoverEffect: 'wave' | 'lift' | 'none'; clickEffect: 'bounce' | 'pulse' | 'none';
  opacity: number; radius: number; theme: Theme; showLabels: boolean; fontFamily: string; fontSize: number;
  autoHide: boolean; hideDelay: number; alwaysOnTop: boolean; groupLayout: 'grid' | 'list' | 'fan' | 'stack';
  launchOnStartup: boolean; showTray: boolean; hideDesktopIcons: boolean; middleClickDesktop: boolean;
  taskbarStyle: 'system' | 'transparent' | 'blur' | 'color'; taskbarColor: string; taskbarOpacity: number;
  screenCorners: boolean; cornerRadius: number; reduceMotion: boolean;
  detectUsb: boolean; systemLaunch: boolean; blockNetwork: boolean; triggerColor: string;
  iconReflection: boolean; startupAnimation: boolean;
}
export interface Config { version: 1; settings: Settings; items: DockItem[] }
export type AppCategory = 'application' | 'system' | 'website' | 'utility' | 'unavailable';
export interface InstalledApp extends DockItem { category: AppCategory; source: string; detail: string }
export interface BitDockPreview {
  token: string; source: string; items: DockItem[]; itemCount: number; groupCount: number; iconCount: number;
  warnings: string[]; appearance: Partial<Settings>;
}
export interface DisplayInfo { id: string; name: string; primary: boolean; width: number; height: number }
export interface NativeStatus { available: boolean; message: string; desktopHidden: boolean; taskbarSupported: boolean }
export interface UsbDrive { path: string; name: string; ready: boolean }
export interface AppState { config: Config; displays: DisplayInfo[]; native: NativeStatus; version: string; preview: boolean; autostart?: boolean; usbDrives?: UsbDrive[]; networkStatus?: string }
export const defaultSettings: Settings = {
  position: 'bottom', displayId: 'primary', iconSize: 48, zoom: 100, gap: 10, edgeMargin: 14, offset: 0,
  magnification: 1.6, magnifyRange: 2.3, hoverEffect: 'wave', clickEffect: 'bounce',
  opacity: 72, radius: 24, theme: 'glass', showLabels: true, fontFamily: 'Microsoft YaHei UI', fontSize: 12,
  autoHide: false, hideDelay: 650, alwaysOnTop: true, groupLayout: 'stack', launchOnStartup: false,
  showTray: true, hideDesktopIcons: false, middleClickDesktop: false, taskbarStyle: 'system',
  taskbarColor: '#303044', taskbarOpacity: 65, screenCorners: false, cornerRadius: 20, reduceMotion: false,
  detectUsb: false, systemLaunch: true, blockNetwork: false, triggerColor: '#658a87', iconReflection: false, startupAnimation: true,
};
export const defaultItems: DockItem[] = [
  { id: 'files', name: '文件资源管理器', kind: 'builtin', target: 'explorer', glyph: 'files', color: '#eab04d' },
  { id: 'browser', name: '浏览器', kind: 'url', target: 'https://www.bing.com', glyph: 'browser', color: '#51b7d6' },
  { id: 'workspace', name: '工作空间', kind: 'group', target: '', glyph: 'code', color: '#a799df', children: [
    { id: 'terminal', name: '终端', kind: 'builtin', target: 'terminal', glyph: 'terminal', color: '#465267' },
    { id: 'notepad', name: '记事本', kind: 'builtin', target: 'notepad', glyph: 'code', color: '#649aca' },
    { id: 'github', name: 'GitHub', kind: 'url', target: 'https://github.com', glyph: 'globe', color: '#697183' },
  ] },
  { id: 'music', name: '音乐', kind: 'builtin', target: 'music', glyph: 'music', color: '#e89bab' },
  { id: 'photos', name: '图片', kind: 'builtin', target: 'pictures', glyph: 'image', color: '#8dbb91' },
  { id: 'sep', name: '分隔线', kind: 'separator', target: '', glyph: 'box', color: '#aaaaaa' },
  { id: 'settings', name: '控制中心', kind: 'builtin', target: 'settings', glyph: 'settings', color: '#8997b2' },
  { id: 'trash', name: '回收站', kind: 'builtin', target: 'recycle', glyph: 'trash', color: '#a1b6b7' },
];
export function createDefaultConfig(): Config { return { version: 1, settings: { ...defaultSettings }, items: structuredClone(defaultItems) }; }
const ranges: Record<string, [number, number]> = {
  iconSize: [28, 88], zoom: [70, 140], gap: [0, 28], edgeMargin: [0, 120], offset: [-600, 600],
  magnification: [1, 2.4], magnifyRange: [1, 4], opacity: [0, 100], radius: [0, 40], fontSize: [10, 20],
  hideDelay: [100, 3000], taskbarOpacity: [0, 100], cornerRadius: [6, 60],
};
const choices: Record<string, readonly string[]> = {
  position: ['bottom', 'top', 'left', 'right'], theme: ['glass', 'cloud', 'midnight', 'rose'],
  hoverEffect: ['wave', 'lift', 'none'], clickEffect: ['bounce', 'pulse', 'none'],
  groupLayout: ['grid', 'list', 'fan', 'stack'], taskbarStyle: ['system', 'transparent', 'blur', 'color'],
};
export function normalizeSettings(value: unknown): Settings {
  const result = { ...defaultSettings };
  if (!value || typeof value !== 'object') return result;
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(result) as (keyof Settings)[]) {
    const v = input[key];
    if (ranges[key] && typeof v === 'number' && Number.isFinite(v)) {
      (result as unknown as Record<string, unknown>)[key] = Math.min(ranges[key][1], Math.max(ranges[key][0], v));
    } else if (choices[key] && typeof v === 'string' && choices[key].includes(v)) {
      (result as unknown as Record<string, unknown>)[key] = v;
    } else if (typeof defaultSettings[key] === 'boolean' && typeof v === 'boolean') {
      (result as unknown as Record<string, unknown>)[key] = v;
    }
  }
  if (typeof input.displayId === 'string' && input.displayId.length < 100) result.displayId = input.displayId;
  if (typeof input.fontFamily === 'string' && /^[\w\s\u4e00-\u9fff-]{1,60}$/.test(input.fontFamily)) result.fontFamily = input.fontFamily;
  if (typeof input.taskbarColor === 'string' && /^#[a-f\d]{6}$/i.test(input.taskbarColor)) result.taskbarColor = input.taskbarColor;
  if (typeof input.triggerColor === 'string' && /^#[a-f\d]{6}$/i.test(input.triggerColor)) result.triggerColor = input.triggerColor;
  return result;
}
const glyphs: Glyph[] = ['folder','browser','code','music','image','terminal','settings','trash','game','chat','box','files','globe','plus'];
export function normalizeItems(value: unknown): DockItem[] {
  if (!Array.isArray(value)) return structuredClone(defaultItems);
  const ids = new Set<string>();
  let total = 0;
  const read = (items: unknown[], depth: number): DockItem[] => items.slice(0, 60).flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || total >= 120) return [];
    const x = raw as DockItem;
    if (!['app','url','folder','group','builtin','separator'].includes(x.kind) || (depth > 0 && x.kind === 'group')) return [];
    if (typeof x.id !== 'string' || !/^[\w-]{1,100}$/.test(x.id) || ids.has(x.id)) return [];
    ids.add(x.id); total++;
    const item: DockItem = {
      id: x.id, name: String(x.name || '未命名').slice(0, 80), kind: x.kind, target: String(x.target || '').slice(0, 2048),
      glyph: glyphs.includes(x.glyph) ? x.glyph : 'box', color: /^#[a-f\d]{6}$/i.test(x.color) ? x.color : '#a799df',
    };
    if (typeof x.icon === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x.icon) && x.icon.length < 400000) item.icon = x.icon;
    if (typeof x.arguments === 'string') item.arguments = x.arguments.slice(0, 2048);
    if (typeof x.workingDirectory === 'string') item.workingDirectory = x.workingDirectory.slice(0, 2048);
    if (x.kind === 'group') item.children = read(Array.isArray(x.children) ? x.children : [], depth + 1);
    return [item];
  });
  return read(value, 0);
}
export function normalizeConfig(value: unknown): Config {
  const x = value && typeof value === 'object' ? value as Partial<Config> : {};
  return { version: 1, settings: normalizeSettings(x.settings), items: normalizeItems(x.items) };
}
export function findItem(items: DockItem[], id: string): DockItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children && findItem(item.children, id);
    if (child) return child;
  }
}
export function removeItem(items: DockItem[], id: string): DockItem[] {
  return items
    .filter(item => item.id !== id)
    .map(item => item.children ? { ...item, children: removeItem(item.children, id) } : item);
}
export function magnify(distance: number, settings: Settings): number {
  if (settings.hoverEffect === 'none' || settings.reduceMotion) return 1;
  if (settings.hoverEffect === 'lift') return Math.abs(distance) < .5 ? settings.magnification : 1;
  return 1 + (settings.magnification - 1) * Math.pow(Math.cos(Math.min(Math.abs(distance) / settings.magnifyRange, 1) * Math.PI / 2), 2);
}
export function dockMetrics(settings: Settings, itemCount: number, displayWidth: number, displayHeight: number) {
  const vertical = settings.position === 'left' || settings.position === 'right';
  const available = Math.max(120, (vertical ? displayHeight : displayWidth) - 32);
  const desiredSize = settings.iconSize * settings.zoom / 100;
  const fit = Math.min(1, (available - 64) / Math.max(1, itemCount * (desiredSize + settings.gap) + waveReserve(desiredSize, itemCount, settings)));
  const size = Math.max(16, desiredSize * fit);
  const gap = settings.gap * fit;
  const length = Math.min(available, Math.ceil(itemCount * (size + gap) + waveReserve(size, itemCount, settings) + 64));
  return { vertical, size, gap, length, thickness: Math.ceil(size * settings.magnification + 80) };
}
