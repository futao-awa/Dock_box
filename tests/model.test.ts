import { describe, expect, it } from 'vitest';
import { createDefaultConfig, defaultSettings, dockMetrics, findItem, magnify, normalizeConfig, normalizeItems, normalizeSettings, removeItem } from '../shared/model';

describe('configuration boundaries', () => {
  it('keeps defaults isolated between profiles', () => {
    const a = createDefaultConfig(), b = createDefaultConfig();
    a.items[2].children![0].name = 'Changed';
    a.settings.iconSize = 88;
    expect(b.items[2].children![0].name).toBe('终端');
    expect(b.settings.iconSize).toBe(48);
  });
  it('clamps numeric settings and rejects invalid values', () => {
    const s = normalizeSettings({ iconSize: 999, offset: -900, opacity: NaN, zoom: '120', theme: 'missing', autoHide: 'yes', taskbarColor: 'red', fontFamily: 'url(evil)' });
    expect(s.iconSize).toBe(88);
    expect(s.offset).toBe(-600);
    expect(s.opacity).toBe(defaultSettings.opacity);
    expect(s.zoom).toBe(100);
    expect(s.autoHide).toBe(false);
    expect(s.theme).toBe('glass');
    expect(s.taskbarColor).toBe(defaultSettings.taskbarColor);
    expect(s.fontFamily).toBe(defaultSettings.fontFamily);
  });
  it('preserves intentional zeroes, empty docks and valid Chinese fonts', () => {
    const config = normalizeConfig({ settings: { gap: 0, opacity: 0, fontFamily: '微软雅黑' }, items: [] });
    expect(config.items).toEqual([]);
    expect(config.settings.gap).toBe(0);
    expect(config.settings.opacity).toBe(0);
    expect(config.settings.fontFamily).toBe('微软雅黑');
  });
  it('rejects duplicate IDs across groups and remote icon sources', () => {
    const item = createDefaultConfig().items[0];
    const group = createDefaultConfig().items[2];
    const items = normalizeItems([{ ...group, children: [item, { ...item, id: 'another', icon: 'https://example.com/icon.png' }] }, item]);
    expect(items).toHaveLength(1);
    expect(items[0].children).toHaveLength(2);
    expect(items[0].children![1].icon).toBeUndefined();
  });
  it('limits oversized imports and ignores unsupported nested groups', () => {
    const base = createDefaultConfig().items[0];
    expect(normalizeItems(Array.from({ length: 500 }, (_, n) => ({ ...base, id: `item-${n}` })))).toHaveLength(60);
    const group = createDefaultConfig().items[2];
    expect(normalizeItems([{ ...group, children: [{ ...group, id: 'nested' }] }])[0].children).toEqual([]);
  });
});

describe('group operations', () => {
  it('finds and removes a child without deleting its group or mutating input', () => {
    const config = createDefaultConfig();
    expect(findItem(config.items, 'terminal')?.target).toBe('terminal');
    const next = removeItem(config.items, 'terminal');
    expect(findItem(next, 'terminal')).toBeUndefined();
    expect(findItem(next, 'workspace')?.children).toHaveLength(2);
    expect(findItem(config.items, 'workspace')?.children).toHaveLength(3);
  });
  it('removes a group and all of its children', () => {
    const next = removeItem(createDefaultConfig().items, 'workspace');
    expect(findItem(next, 'workspace')).toBeUndefined();
    expect(findItem(next, 'github')).toBeUndefined();
    expect(findItem(next, 'files')).toBeDefined();
  });
});

describe('Dock layout and animation', () => {
  it('uses a symmetric wave with bounded influence', () => {
    expect(magnify(0, defaultSettings)).toBe(1.6);
    expect(magnify(1, defaultSettings)).toBeCloseTo(magnify(-1, defaultSettings));
    expect(magnify(5, defaultSettings)).toBe(1);
    expect(magnify(0, { ...defaultSettings, reduceMotion: true })).toBe(1);
    expect(magnify(0, { ...defaultSettings, hoverEffect: 'none' })).toBe(1);
    expect(magnify(1, { ...defaultSettings, hoverEffect: 'lift' })).toBe(1);
  });
  it.each(['bottom', 'top', 'left', 'right'] as const)('fits the window on the %s edge', position => {
    const metrics = dockMetrics({ ...defaultSettings, position }, 30, 1366, 728);
    expect(metrics.length).toBeLessThanOrEqual((metrics.vertical ? 728 : 1366) - 32);
    expect(metrics.size).toBeGreaterThanOrEqual(16);
    expect(Number.isFinite(metrics.thickness)).toBe(true);
  });
});
