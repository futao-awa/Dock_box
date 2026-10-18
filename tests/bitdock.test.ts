import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countItems, loadBitDock, locateBitDock, readBitDockXml, readQtIni } from '../electron/bitdock';
const directories: string[] = [];
const xml = (nodes: string) => `<?xml version="1.0"?><BitDock>${nodes}</BitDock>`;
const entry = (cls: string, id: string, name: string, target = '0') => `<List><IconID>${id}</IconID><Class>${cls}</Class><Name>${name}</Name><Path>${target}</Path></List>`;
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
describe('BitDock migration', () => {
  it('decodes XML entities without accepting DTD or malformed files', () => {
    expect(readBitDockXml(xml(entry('URL', 'ico1', 'A &amp; B', 'https://example.com?a=1&amp;b=2')))[0].Path).toBe('https://example.com?a=1&b=2');
    expect(() => readBitDockXml('<!DOCTYPE BitDock><BitDock/>')).toThrow();
    expect(() => readBitDockXml('<BitDock><List></BitDock>')).toThrow();
    expect(() => readBitDockXml('<Other/>')).toThrow();
  });
  it('reads Qt Unicode font names and booleans without interpreting code', () => {
    expect(readQtIni('[System]\nIconNameFont=\\x5fae\\x8f6f\\x96c5\\x9ed1\nIconNameHide=false')).toMatchObject({ IconNameFont: '微软雅黑', IconNameHide: 'false' });
  });
  it('preserves ordering, menu membership, empty menus and system entries; reports skipped plugins', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dock-bitdock-')); directories.push(root); mkdirSync(path.join(root, 'Data'));
    const data = path.join(root, 'Data');
    writeFileSync(path.join(data, 'BitDock.xml'), xml(entry('COMPUTER', 'ico1', '计算机') + entry('MENU', 'ico2', '开发工具') + entry('BLANK', 'ico3', '间隔符') + entry('MENU', 'ico4', '空分类') + entry('SHUTDOWN', 'ico5', '电源')));
    writeFileSync(path.join(data, 'ico2.xml'), xml(entry('BACK', 'ico0', '返回') + entry('URL', 'ico6', '文档', 'https://example.com') + entry('CMD', 'ico7', '终端')));
    writeFileSync(path.join(data, 'ico4.xml'), xml(''));
    writeFileSync(path.join(data, 'config.ini'), '[System]\nIcoSize=40\nLaunchOnStartup=true\nTaskbarAlpha=true\n');
    const file = locateBitDock(root)!; const result = await loadBitDock(file);
    expect(result.items.map(item => item.name)).toEqual(['计算机', '开发工具', '分隔线', '空分类']);
    expect(result.items[1].children?.map(item => item.name)).toEqual(['文档', '终端']);
    expect(result.items[3].children).toEqual([]); expect(countItems(result.items)).toBe(6);
    expect(result.appearance.iconSize).toBe(40); expect(result.appearance).not.toHaveProperty('launchOnStartup');
    expect(result.warnings.some(message => message.includes('SHUTDOWN'))).toBe(true);
    expect((await loadBitDock(file)).items).toEqual(result.items);
  });
  it('prevents menu path traversal and stops cyclic menus', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dock-bitdock-')); directories.push(root);
    const file = path.join(root, 'BitDock.xml');
    writeFileSync(file, xml(entry('MENU', '../secret', '无效') + entry('MENU', 'ico1', '循环')));
    writeFileSync(path.join(root, 'ico1.xml'), xml(entry('MENU', 'ico1', '自引用')));
    const result = await loadBitDock(file); expect(result.warnings).toHaveLength(3); expect(result.items[0].children).toEqual([]);
  });
});
