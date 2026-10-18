import { _electron as electron, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Optional --bitdock validates a user's dataset in an isolated profile. Source data is read-only.
const args = process.argv.slice(2), sourceIndex = args.indexOf('--bitdock'), exeIndex = args.indexOf('--exe');
const output = path.resolve('artifacts/migration'); mkdirSync(output, { recursive: true });
const profile = mkdtempSync(path.join(output, 'profile-'));
const fixture = path.join(profile, 'BitDock'); mkdirSync(path.join(fixture, 'Data'), { recursive: true }); mkdirSync(path.join(fixture, 'icon'));
const list = (type, id, name, target = '0', icon = '') => `<List><Class>${type}</Class><IconID>${id}</IconID><Name>${name}</Name><Path>${target}</Path><Icon>${icon}</Icon></List>`;
const xml = nodes => `<BitDock>${nodes}</BitDock>`;
writeFileSync(path.join(fixture, 'Data/BitDock.xml'), xml(list('COMPUTER', 'ico1', '计算机') + list('MENU', 'ico2', '迁移分类') + list('BLANK', 'ico3', '间隔符')));
writeFileSync(path.join(fixture, 'Data/ico2.xml'), xml(list('BACK', 'ico0', '返回') + list('ICON', 'ico4', '记事本', `${process.env.WINDIR.replaceAll('\\', '/')}/System32/notepad.exe`, 'app.png')));
writeFileSync(path.join(fixture, 'icon/app.png'), readFileSync('assets/app.png'));
const source = sourceIndex >= 0 ? path.resolve(args[sourceIndex + 1]) : path.join(fixture, 'Data/BitDock.xml');
const env = { ...process.env, DOCK_BOX_PROFILE: profile, DOCK_BOX_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE; delete env.DOCK_BOX_DEV_URL;
const executablePath = exeIndex >= 0 ? path.resolve(args[exeIndex + 1]) : undefined;
const application = await electron.launch({ executablePath, args: executablePath ? ['--disable-gpu'] : ['.', '--disable-gpu'], env });
try {
  let settings, dock;
  for (let i = 0; i < 100 && (!settings || !dock); i++) { settings = application.windows().find(page => page.url().endsWith('#/settings')); dock = application.windows().find(page => page.url().endsWith('#/dock')); if (!settings || !dock) await delay(100); }
  await expect(settings.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(async () => (await settings.evaluate(() => window.dockBox.getState())).native.available).toBe(true);
  const before = await settings.evaluate(() => window.dockBox.getState());
  await application.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, source);
  await settings.locator('nav').getByRole('button', { name: '应用与分类', exact: true }).click();
  await settings.getByRole('button', { name: '导入 BitDock', exact: true }).click();
  await settings.getByRole('button', { name: '选择 BitDock.xml', exact: true }).click();
  const modal = settings.getByRole('dialog', { name: '导入 BitDock', exact: true });
  await expect(modal.locator('.import-summary')).toBeVisible({ timeout: 90000 });
  if (!executablePath) await modal.screenshot({ path: path.join(output, 'preview.png'), animations: 'disabled' });
  // Refresh the draft through the API to validate the exact data that will be applied.
  const preview = await settings.evaluate(() => window.dockBox.previewBitDock('file'));
  expect(preview.itemCount).toBeGreaterThan(0); expect(preview.iconCount).toBeGreaterThan(0);
  const result = await settings.evaluate(token => window.dockBox.applyBitDock(token, 'append', false), preview.token);
  expect(JSON.parse(readFileSync(result.backup, 'utf8'))).toEqual(before.config);
  expect(result.state.config.settings).toEqual(before.config.settings);
  for (const item of preview.items) expect(result.state.config.items.find(entry => entry.id === item.id)?.name).toBe(item.name);
  for (const item of result.state.config.items.flatMap(item => [item, ...(item.children || [])])) if (item.target.includes('imported-shortcuts')) expect(existsSync(item.target)).toBe(true);
  const again = await settings.evaluate(() => window.dockBox.previewBitDock('file'));
  const repeated = await settings.evaluate(token => window.dockBox.applyBitDock(token, 'append', false), again.token);
  expect(repeated.state.config.items.length).toBe(result.state.config.items.length);
  await settings.reload();
  await expect(settings.getByRole('heading', { level: 1 })).toBeVisible();
  for (const position of ['bottom', 'top', 'left', 'right']) {
    await settings.evaluate(position => window.dockBox.updateSettings({ position, magnification: 1.8, hoverEffect: 'wave', reduceMotion: false }), position);
    await dock.mouse.move(1, 1); await delay(500);
    const base = await dock.locator('.dock-strip').boundingBox();
    const first = dock.locator('.dock-item').first(), rect = await first.boundingBox();
    await dock.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await expect.poll(() => first.evaluate(element => Number(element.style.getPropertyValue('--item-scale')))).toBeGreaterThan(1.1);
    const expanded = await dock.locator('.dock-strip').boundingBox(), vertical = ['left', 'right'].includes(position);
    expect(vertical ? expanded.height : expanded.width).toBeGreaterThan(vertical ? base.height : base.width);
    const geometry = await dock.locator('.dock-art').evaluateAll(elements => elements.map(element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; }));
    for (let i = 1; i < geometry.length; i++) expect(vertical ? geometry[i].y - geometry[i - 1].bottom : geometry[i].x - geometry[i - 1].right).toBeGreaterThanOrEqual(-.5);
    expect(expanded.x).toBeGreaterThanOrEqual(0); expect(expanded.y).toBeGreaterThanOrEqual(0);
    const viewport = await dock.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(expanded.x + expanded.width).toBeLessThanOrEqual(viewport.width + 1); expect(expanded.y + expanded.height).toBeLessThanOrEqual(viewport.height + 1);
    if (!executablePath) await dock.screenshot({ path: path.join(output, `wave-${position}.png`), omitBackground: true });
    await dock.mouse.move(Math.max(0, base.x - 20), Math.max(0, base.y - 20));
    await expect.poll(() => first.evaluate(element => Number(element.style.getPropertyValue('--item-scale'))), { timeout: 10000 }).toBeLessThan(1.05);
  }
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, itemCount: preview.itemCount, groupCount: preview.groupCount, iconCount: preview.iconCount, warnings: preview.warnings, backup: result.backup }, null, 2));
  console.log(`PASS: BitDock imported ${preview.itemCount} entries, ${preview.groupCount} groups, ${preview.iconCount} icons; backup, repeat import and four-edge waves verified`);
} finally { await application.close(); }
