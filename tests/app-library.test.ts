import { describe, expect, it } from 'vitest';
import { appIdentity, buildAppLibrary, categorizeApp, type AppEntry } from '../electron/app-library';
const app = (patch: Partial<AppEntry> = {}): AppEntry => ({ name: '编辑器', target: 'C:\\Menu\\编辑器.lnk', resolvedTarget: 'D:\\Apps\\Editor.exe', source: '开始菜单', available: 'true', ...patch });
describe('Windows application library', () => {
  it('merges duplicate targets but preserves different arguments and same-name versions', () => {
    const entries = buildAppLibrary([app(), app({ target: 'C:\\Desktop\\Editor.lnk', icon: 'data:image/png;base64,AA==' }), app({ resolvedArguments: '--profile Work' }), app({ resolvedTarget: 'D:\\Editor2\\Editor.exe' })]);
    expect(entries).toHaveLength(3);
    expect(entries.find(entry => entry.target === 'C:\\Menu\\编辑器.lnk')?.icon).toBeDefined();
    expect(new Set(entries.map(entry => entry.id)).size).toBe(3);
  });
  it('deduplicates packaged shortcuts and AppsFolder by application ID', () => {
    expect(appIdentity(app({ appId: 'Vendor.App_123!App' }))).toBe(appIdentity(app({ target: 'shell:AppsFolder\\Vendor.App_123!App', resolvedTarget: '', appId: 'Vendor.App_123!App' })));
  });
  it.each([
    ['网页官网', 'https://example.com', 'website'], ['7-Zip Help', 'D:\\7zip\\7-zip.chm', 'utility'],
    ['本地安全策略', 'C:\\Windows\\System32\\secpol.msc', 'system'], ['卸载软件', 'D:\\App\\unins000.exe', 'utility'],
    ['Visual Studio Code', 'D:\\Code\\Code.exe', 'application'], ['记事本', 'C:\\Windows\\System32\\notepad.exe', 'application'],
  ])('classifies %s by its launch target', (name, resolvedTarget, expected) => {
    expect(categorizeApp(app({ name, resolvedTarget }))).toBe(expected);
  });
  it('keeps broken entries out of the default applications view', () => { expect(categorizeApp(app({ available: 'false' }))).toBe('unavailable'); });
});
