import { _electron as electron, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Test the actual Electron preload, IPC and packaged renderer using an isolated profile.
// Smoke mode suppresses system changes, external launches, tray icons and global shortcuts.
const executableIndex = process.argv.indexOf('--exe');
const executablePath = executableIndex >= 0 ? path.resolve(process.argv[executableIndex + 1]) : undefined;
const output = path.resolve('artifacts', executablePath ? 'smoke-packaged' : 'smoke-desktop');
mkdirSync(output, { recursive: true });
const profile = mkdtempSync(path.join(output, 'profile-'));
const env = { ...process.env, DOCK_BOX_PROFILE: profile, DOCK_BOX_SMOKE: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.DOCK_BOX_DEV_URL;
const errors = [];
let application;

async function launch() {
  application = await electron.launch({ executablePath, args: executablePath ? ['--disable-gpu'] : ['.', '--disable-gpu'], env, timeout: 30000 });
  application.process().stderr.on('data', data => process.stderr.write(data));
  application.on('window', page => page.on('pageerror', error => errors.push(error.message)));
  for (const page of application.windows()) page.on('pageerror', error => errors.push(error.message));
}
async function pageFor(hash) {
  for (let i = 0; i < 100; i++) {
    const page = application.windows().find(window => window.url().endsWith(`#${hash}`));
    if (page) { await page.waitForLoadState('domcontentloaded'); return page; }
    await delay(100);
  }
  throw new Error(`Window did not open: ${hash}; pages: ${JSON.stringify(application.windows().map(page => page.url()))}; windows: ${JSON.stringify(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.webContents.getURL())))}`);
}
const stateOf = page => page.evaluate(() => window.dockBox.getState());
const capture = async (page, screenshotPath, options) => { if (!executablePath) await page.screenshot({ path: screenshotPath, animations: 'disabled', ...options }); };
async function closeGroupPage(page) {
  await page.getByRole('button', { name: '关闭分类' }).click();
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().includes('#/group/')).every(window => !window.isVisible()))).toBe(true);
}

try {
  await launch();
  let settings = await pageFor('/settings');
  const dock = await pageFor('/dock');
  await expect(settings.getByText('我的桌面空间')).toBeVisible();
  await expect(settings.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(dock.getByRole('button', { name: '工作空间', exact: true })).toBeVisible();
  await expect.poll(async () => (await stateOf(settings)).native.available).toBe(true);
  expect(await dock.evaluate(() => [document.documentElement, document.body, document.getElementById('root')].map(element => getComputedStyle(element).backgroundColor))).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  await capture(settings, path.join(output, 'overview.png'));
  console.log('PASS: desktop renderer, sandboxed preload and Windows bridge');

  for (const label of ['Dock 外观', '动效与交互', '应用与分类', '桌面美化', '通用设置']) {
    await settings.locator('nav').getByRole('button', { name: label }).click();
    await expect(settings.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await settings.locator('nav').getByRole('button', { name: 'Dock 外观' }).click();
  await settings.getByRole('button', { name: '右侧', exact: true }).click();
  await expect.poll(async () => (await stateOf(settings)).config.settings.position).toBe('right');
  await expect(dock.locator('.desktop-dock')).toHaveClass(/position-right/);
  await capture(settings, path.join(output, 'appearance.png'));
  await settings.getByRole('button', { name: '底部', exact: true }).click();
  await settings.evaluate(() => window.dockBox.updateSettings({ iconSize: 56, theme: 'rose' }));
  await expect(dock.locator('.dock-strip')).toHaveClass(/theme-rose/);
  console.log('PASS: settings navigation and live Dock updates');

  await settings.locator('nav').getByRole('button', { name: '应用与分类' }).click();
  await settings.getByRole('button', { name: '网址', exact: true }).click();
  await settings.getByRole('textbox', { name: '显示名称', exact: true }).fill('回归测试网址');
  await settings.getByRole('textbox', { name: '启动路径或网址' }).fill('javascript:alert(1)');
  await settings.getByRole('button', { name: '添加到我的空间' }).click();
  await expect(settings.getByRole('alert')).toContainText('完整网址');
  await settings.getByRole('textbox', { name: '启动路径或网址' }).fill('https://example.com');
  await settings.getByRole('button', { name: '添加到我的空间' }).click();
  await expect(settings.getByRole('dialog', { name: '添加快捷入口' })).toHaveCount(0);
  await expect(dock.getByRole('button', { name: '回归测试网址', exact: true })).toBeVisible();

  await settings.getByRole('button', { name: '新建分类', exact: true }).click();
  await settings.getByRole('textbox', { name: '显示名称', exact: true }).fill('测试分类');
  await settings.getByRole('button', { name: '添加到我的空间' }).click();
  await expect(settings.getByRole('dialog', { name: '添加快捷入口' })).toHaveCount(0);
  const group = (await stateOf(settings)).config.items.find(item => item.name === '测试分类');
  await settings.getByRole('combobox', { name: '移动 回归测试网址 到分类' }).selectOption(group.id);
  await expect(dock.getByRole('button', { name: '回归测试网址', exact: true })).toHaveCount(0);
  await dock.getByRole('button', { name: '测试分类', exact: true }).click();
  let groupPage = await pageFor(`/group/${group.id}`);
  await expect(groupPage.getByRole('button', { name: '回归测试网址', exact: true })).toBeVisible();
  await capture(groupPage, path.join(output, 'group.png'), { animations: 'disabled' });
  await expect.poll(() => groupPage.locator('.group-items').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);

  // Capture a native menu and invoke its command, without displaying a desktop popup.
  await application.evaluate(({ Menu }) => {
    Menu.buildFromTemplate = template => ({ popup() { globalThis.__dockTestMenu = template; } });
  });
  await groupPage.getByRole('button', { name: '回归测试网址', exact: true }).click({ button: 'right' });
  await expect.poll(() => application.evaluate(() => !!globalThis.__dockTestMenu)).toBe(true);
  await application.evaluate(() => globalThis.__dockTestMenu.find(entry => entry.label === '从 Dock 移除').click());
  await expect(groupPage.getByRole('button', { name: '回归测试网址', exact: true })).toHaveCount(0);
  await closeGroupPage(groupPage);
  console.log('PASS: URL validation, creating groups, moving apps, group right-click removal');

  for (const layout of ['grid', 'list', 'fan', 'stack']) {
    await settings.evaluate(layout => window.dockBox.updateSettings({ groupLayout: layout }), layout);
    await dock.getByRole('button', { name: '工作空间', exact: true }).click();
    groupPage = await pageFor('/group/workspace');
    await expect(groupPage.locator('.group-items')).toHaveClass(new RegExp(`layout-${layout}`));
    await expect(groupPage.getByRole('button', { name: '终端', exact: true })).toBeVisible();
    expect(await groupPage.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await expect.poll(() => groupPage.locator('.group-items').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    if (layout === 'stack') {
      expect(await groupPage.locator('.group-window').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      const icons = await groupPage.locator('.group-items > button > .icon-tile').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().right));
      expect(Math.max(...icons) - Math.min(...icons)).toBeLessThan(1);
      await capture(groupPage, path.join(output, 'stack.png'), { animations: 'disabled', omitBackground: true });
    }
    await groupPage.getByRole('button', { name: '终端', exact: true }).click();
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().includes('#/group/')).every(window => !window.isVisible()))).toBe(true);
  }
  await settings.evaluate(() => window.dockBox.updateSettings({ groupLayout: 'grid' }));
  console.log('PASS: four group layouts, transparent stack and launch without destroying the renderer');

  const appLibrary = await settings.evaluate(() => window.dockBox.scanApps());
  expect(appLibrary.length).toBeGreaterThan(0);
  expect(appLibrary.some(item => item.icon?.startsWith('data:image/png;base64,'))).toBe(true);
  console.log(`PASS: detected ${appLibrary.length} Windows apps with local icons`);
  await dock.getByRole('button', { name: '工作空间', exact: true }).click({ button: 'right' });
  const menuLabels = await application.evaluate(() => globalThis.__dockTestMenu.map(item => item.label));
  for (const label of ['刷新 Dock', '任务管理器', '图标设置', '添加应用', '分类管理']) expect(menuLabels).toContain(label);
  await application.evaluate(() => globalThis.__dockTestMenu.find(item => item.label === '图标设置').click());
  let manager = await pageFor('/manage/icons/workspace');
  await expect(manager.getByRole('dialog', { name: '编辑快捷入口' })).toBeVisible();
  await manager.getByRole('button', { name: '关闭编辑', exact: true }).click();
  expect(await manager.locator('.sidebar').count()).toBe(0);
  await manager.getByRole('button', { name: '关闭管理窗口' }).click().catch(error => { if (!manager.isClosed()) throw error; });
  await settings.evaluate(() => window.dockBox.openManager('icons'));
  manager = await pageFor('/manage/icons/');
  await expect(manager.getByRole('switch', { name: '图标倒影', exact: true })).toBeVisible();
  await capture(manager, path.join(output, 'icons.png'));
  await manager.getByRole('button', { name: '关闭管理窗口' }).click().catch(error => { if (!manager.isClosed()) throw error; });
  console.log('PASS: dedicated icon pages and Dock recovery/context actions');
  await settings.evaluate(() => window.dockBox.refreshDock());
  const refreshedDock = await pageFor('/dock');
  await expect(refreshedDock.getByRole('button', { name: '工作空间', exact: true })).toBeVisible();
  await refreshedDock.getByRole('button', { name: '工作空间', exact: true }).click();
  const refreshedGroup = await pageFor('/group/workspace');
  await refreshedGroup.getByRole('button', { name: 'GitHub', exact: true }).click();
  console.log('PASS: Dock refresh recreates a usable renderer and group URLs launch');

  const exportPath = path.join(output, 'export.json');
  await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
  expect(await settings.evaluate(() => window.dockBox.exportConfig())).toBe(true);
  const exported = JSON.parse(readFileSync(exportPath, 'utf8'));
  expect(exported.settings.iconSize).toBe(56);
  const importPath = path.join(output, 'import.json');
  const beforeImport = await stateOf(settings);
  writeFileSync(importPath, JSON.stringify({ ...exported, settings: { ...exported.settings, iconSize: 62, launchOnStartup: true, taskbarStyle: 'color', hideDesktopIcons: !beforeImport.config.settings.hideDesktopIcons } }));
  await application.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, importPath);
  await settings.evaluate(() => window.dockBox.importConfig());
  const imported = await stateOf(settings);
  expect(imported.config.settings.iconSize).toBe(62);
  expect(imported.config.settings.launchOnStartup).toBe(false);
  expect(imported.config.settings.taskbarStyle).toBe(beforeImport.config.settings.taskbarStyle);
  expect(imported.config.settings.hideDesktopIcons).toBe(beforeImport.config.settings.hideDesktopIcons);

  // The native file picker and launch validation use a real file in the isolated test directory.
  const file = path.join(output, 'sample.txt');
  writeFileSync(file, 'Dock Box smoke fixture');
  await application.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, file);
  const picked = await settings.evaluate(() => window.dockBox.pickApp());
  expect(picked.target).toBe(file);
  expect(picked.name).toBe('sample');
  console.log('PASS: file picking, config export/import and preserving local system switches');

  await application.close();
  application = undefined;
  await launch();
  settings = await pageFor('/settings');
  await expect(settings.getByText('我的桌面空间')).toBeVisible();
  const restarted = await stateOf(settings);
  expect(restarted.config.settings.iconSize).toBe(62);
  expect(restarted.config.settings.theme).toBe('rose');
  expect(restarted.config.items.find(item => item.id === group.id)?.children).toEqual([]);
  expect(errors).toEqual([]);
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, executable: executablePath || 'development build', version: restarted.version, native: restarted.native, rendererErrors: errors, profile }, null, 2));
  console.log('PASS: profile survives restart; no renderer errors');
} finally {
  if (application) await application.close();
}
