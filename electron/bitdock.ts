import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { DockItem, Settings } from '../shared/model';

export interface BitDockData { items: DockItem[]; warnings: string[]; appearance: Partial<Settings>; icons: Map<string, string>; source: string }
const localPath = (value: string) => /^[a-z]:[\\/]/i.test(value) && !value.includes('\0');
export function readBitDockXml(text: string): Record<string, string>[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || text.length > 4 * 1024 * 1024 || XMLValidator.validate(text) !== true) throw new Error('BitDock XML 格式无效或包含不支持的声明。');
  const doc = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false, isArray: tag => tag === 'List' }).parse(text);
  if (!doc.BitDock || typeof doc.BitDock !== 'object') throw new Error('请选择 BitDock 的 Data/BitDock.xml。');
  return (doc.BitDock.List || []).map((entry: Record<string, unknown>) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, typeof value === 'string' ? value : ''])));
}
export function readQtIni(text: string): Record<string, string> {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => line.includes('=') && !/^\s*[;#]/.test(line)).map(line => {
    const index = line.indexOf('='); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"(.*)"$/, '$1').replace(/\\x([a-f\d]{1,4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))];
  }));
}
async function textFile(file: string) {
  if ((await stat(file)).size > 4 * 1024 * 1024) throw new Error('BitDock 配置文件过大。');
  const bytes = await readFile(file); return bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/, '');
}
export function locateBitDock(selection?: string, documents = path.join(process.env.USERPROFILE || '', 'Documents')): string | undefined {
  const candidates: string[] = [];
  if (selection) candidates.push(selection, path.join(selection, 'BitDock.xml'), path.join(selection, 'Data/BitDock.xml'));
  else {
    try {
      const local = readQtIni(readFileSync(path.join(process.env.LOCALAPPDATA || '', 'BitDock/config.ini'), 'utf8')).AppDataLocal;
      if (local && localPath(local)) candidates.push(path.join(local, 'Data/BitDock.xml'));
    } catch { }
    candidates.push(path.join(documents, 'BitSoft Files/BitDock/Data/BitDock.xml'), path.join(process.env.APPDATA || '', 'BitDock/Data/BitDock.xml'));
  }
  return candidates.find(file => /BitDock\.xml$/i.test(file) && existsSync(file));
}
export async function loadBitDock(file: string): Promise<BitDockData> {
  const source = path.resolve(file), dataDir = path.dirname(source), home = path.dirname(dataDir);
  const warnings: string[] = [], icons = new Map<string, string>();
  const warn = (message: string) => { if (warnings.length < 200 && !warnings.includes(message)) warnings.push(message); };
  let ini: Record<string, string> = {};
  try { ini = readQtIni(await textFile(path.join(dataDir, 'config.ini'))); } catch { }
  const appearance: Partial<Settings> = {};
  const numeric: [string, keyof Settings][] = [['IcoSize', 'iconSize'], ['IcoNameSize', 'fontSize'], ['Margin', 'edgeMargin'], ['DockLeftRightOffset', 'offset'], ['TransparentBackground', 'opacity']];
  for (const [old, key] of numeric) if (ini[old] && Number.isFinite(Number(ini[old]))) (appearance as Record<string, unknown>)[key] = Number(ini[old]);
  if (ini.IconNameFont) appearance.fontFamily = ini.IconNameFont;
  if (ini.IconNameHide) appearance.showLabels = ini.IconNameHide !== 'true';
  if (ini.IconReflection) appearance.iconReflection = ini.IconReflection === 'true';
  // Location=2 is the bottom layout in the analyzed 2.1.x data. Other location enums are left untouched.
  if (ini.Location === '2') appearance.position = 'bottom';
  appearance.hoverEffect = 'wave'; appearance.groupLayout = 'stack';
  const rebase = (value: string, folder: 'icon' | 'link') => {
    if (localPath(value) && existsSync(value)) return path.normalize(value);
    const local = path.join(home, folder, path.win32.basename(value));
    if (existsSync(local)) return local;
    return localPath(value) ? path.normalize(value) : '';
  };
  let total = 0;
  async function parse(file: string, ancestry: string[], prefix = ''): Promise<DockItem[]> {
    if (ancestry.length > 8 || ancestry.includes(file)) { warn('检测到循环或过深的分类，已跳过重复引用。'); return []; }
    let entries: Record<string, string>[];
    try { entries = readBitDockXml(await textFile(file)); } catch (error) { if (!ancestry.length) throw error; warn(`无法读取分类 ${path.basename(file)}，请检查配套 XML 文件。`); return []; }
    const items: DockItem[] = [];
    for (const [index, entry] of entries.entries()) {
      if (++total > 2000) throw new Error('BitDock 项目数量超过 2000，无法导入。');
      const cls = (entry.Class || '').trim().toUpperCase(), name = `${prefix}${entry.Name || (cls === 'FOLDER' ? entry.Path : '未命名')}`;
      if (cls === 'BACK') continue;
      if (cls === 'UDISK') { warn('U 盘属于动态设备入口，已跳过；可在管理面板开启 U 盘检测。'); continue; }
      const id = `bitdock-${createHash('sha256').update([...ancestry.map(x => path.basename(x)), path.basename(file), entry.IconID, String(index)].join('/')).digest('hex').slice(0, 24)}`;
      const item: DockItem = { id, name, kind: 'app', target: '', glyph: 'box', color: '#658a87' };
      if (['MENU','GRID','GRIDMENU','LISTMENU'].includes(cls)) {
        if (!/^ico\w{1,60}$/.test(entry.IconID || '')) { warn(`「${name}」的分类文件标识无效。`); continue; }
        item.kind = 'group'; item.glyph = 'folder';
        item.children = await parse(path.join(dataDir, `${entry.IconID}.xml`), [...ancestry, file]);
        // dock_box supports one category level. Preserve deeper entries by flattening names.
        item.children = item.children.flatMap(child => child.kind === 'group' ? (warn(`「${child.name}」为嵌套分类，已展开并保留名称前缀。`), (child.children || []).map(leaf => ({ ...leaf, name: `${child.name} / ${leaf.name}` }))) : [child]);
      } else if (cls === 'BLANK' || cls === 'SEPARATOR') { item.kind = 'separator'; item.name = '分隔线'; }
      else if (cls === 'COMPUTER' || cls === 'RECYCLE' || cls === 'CMD' || cls === 'PANEL' || cls === 'SPANEL' || cls === 'SOUNDPREF') {
        const targets: Record<string, string> = { COMPUTER: 'computer', RECYCLE: 'recycle', CMD: 'terminal', PANEL: 'windowsSettings', SPANEL: 'controlpanel', SOUNDPREF: 'sound' };
        item.kind = 'builtin'; item.target = targets[cls]; item.glyph = cls === 'RECYCLE' ? 'trash' : cls === 'COMPUTER' ? 'files' : cls === 'CMD' ? 'terminal' : 'settings';
      } else if (['ICON','FOLDER','URL','WEB','LINK'].includes(cls)) {
        let target = (entry.Path || '').trim();
        if (/^https?:\/\//i.test(target)) { item.kind = 'url'; item.target = target; item.glyph = 'globe'; }
        else {
          target = rebase(target.replace(/^"(.*)"$/, '$1'), 'link');
          if (!target) { warn(`「${name}」不是受支持的本机路径或网址，已跳过。`); continue; }
          item.target = target; item.kind = cls === 'FOLDER' ? 'folder' : 'app'; item.glyph = cls === 'FOLDER' ? 'folder' : 'box';
          if (!existsSync(target)) warn(`「${name}」的路径已失效；入口仍保留，可在导入后重新选择。`);
        }
        if (entry.Arguments || entry.Argument || entry.Args) item.arguments = entry.Arguments || entry.Argument || entry.Args;
        if (entry.WorkingDirectory && localPath(entry.WorkingDirectory)) item.workingDirectory = path.normalize(entry.WorkingDirectory);
      } else { warn(`「${name}」使用 BitDock 专属功能 ${cls || '未知'}，已跳过。`); continue; }
      const iconRef = rebase((entry.Icon || '').replace(/,Icon\/.*$/i, ''), 'icon');
      if (iconRef) icons.set(id, iconRef);
      items.push(item);
    }
    return items;
  }
  return { source, items: await parse(source, []), warnings, appearance, icons };
}
export function countItems(items: DockItem[]): number { return items.reduce((sum, item) => sum + 1 + countItems(item.children || []), 0); }
