import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell, dialog, globalShortcut } from 'electron';
import { existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigStore } from './store';
import { NativeBridge } from './native';
import { resolveLaunch } from './launch';
import { installNetworkGuard, setFirewall } from './network';
import { createDefaultConfig, normalizeConfig, normalizeItems, normalizeSettings, findItem, removeItem, dockMetrics, type AppState, type DockItem, type Settings } from '../shared/model';

// A separate profile makes automated smoke tests independent of the user's desktop setup.
if (process.env.DOCK_BOX_PROFILE) app.setPath('userData', path.resolve(process.env.DOCK_BOX_PROFILE));
const smoke = process.env.DOCK_BOX_SMOKE === '1';
const devUrl = process.env.DOCK_BOX_DEV_URL;
let store: ConfigStore;
let bridge: NativeBridge;
let settingsWindow: BrowserWindow | undefined;
let dockWindow: BrowserWindow | undefined;
let groupWindow: BrowserWindow | undefined;
let managerWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let quitting = false;
let quitReady = false;
let hoverTimer: NodeJS.Timeout | undefined;
let applyTimer: NodeJS.Timeout | undefined;
let lastInside = Date.now();
let ignoreMouse = false;
let hitRegion = { x: 0, y: 0, width: 10000, height: 10000 };
let applying = Promise.resolve();
let settingsSaving = Promise.resolve();
let activeGroupId: string | undefined;
let launching = 0;
let contextOpen = false;
let usbDrives: import('../shared/model').UsbDrive[] = [];
let nativePath: string;
let networkStatus = '';

app.commandLine.appendSwitch('disable-background-networking');

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => openSettings());
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('dock_box 启动失败', String(error)); app.quit(); });
}
function state(): AppState {
  const primary = screen.getPrimaryDisplay().id;
  return { config: store.config, native: bridge.status, version: app.getVersion(), preview: false, autostart: process.argv.includes('--autostart'), usbDrives: store.config.settings.detectUsb ? usbDrives : [], networkStatus,
    displays: screen.getAllDisplays().map((d, index) => ({ id: String(d.id), name: d.label || `显示器 ${index + 1}`, primary: d.id === primary, width: d.size.width, height: d.size.height })) };
}
function broadcast() { for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('state:changed', state()); }
function secureWindow(options: Electron.BrowserWindowConstructorOptions) {
  const window = new BrowserWindow({ ...options, icon: path.join(app.getAppPath(), 'assets/app.png'), webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false,
  } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  return window;
}
function load(window: BrowserWindow, hash: string) {
  if (devUrl) void window.loadURL(`${devUrl}/#${hash}`);
  else void window.loadFile(path.join(app.getAppPath(), 'dist/index.html'), { hash });
}
function openSettings(page?: string) {
  if (!store) return;
  closeGroup();
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = secureWindow({ width: 1180, height: 820, minWidth: 960, minHeight: 680, frame: false, backgroundColor: '#f2f4f5', show: false });
    load(settingsWindow, page ? `/settings/${page}` : '/settings');
    settingsWindow.once('ready-to-show', () => { if (!smoke) settingsWindow?.show(); });
    settingsWindow.on('closed', () => { settingsWindow = undefined; });
  } else { if (!smoke) { settingsWindow.show(); settingsWindow.focus(); } if (page) settingsWindow.webContents.send('page:open', page); }
}
function selectedDisplay() { return screen.getAllDisplays().find(d => String(d.id) === store.config.settings.displayId) || screen.getPrimaryDisplay(); }
function layoutDock() {
  if (!dockWindow) return;
  const s = store.config.settings, area = selectedDisplay().workArea;
  const m = dockMetrics(s, store.config.items.length + (s.detectUsb ? usbDrives.filter(drive => drive.ready).length : 0), area.width, area.height);
  const width = m.vertical ? m.thickness : m.length, height = m.vertical ? m.length : m.thickness;
  let x = area.x + (area.width - width) / 2 + (m.vertical ? 0 : s.offset);
  let y = area.y + (area.height - height) / 2 + (m.vertical ? s.offset : 0);
  if (s.position === 'bottom') y = area.y + area.height - height - s.edgeMargin;
  if (s.position === 'top') y = area.y + s.edgeMargin;
  if (s.position === 'left') x = area.x + s.edgeMargin;
  if (s.position === 'right') x = area.x + area.width - width - s.edgeMargin;
  x = Math.min(Math.max(area.x, x), area.x + area.width - width);
  y = Math.min(Math.max(area.y, y), area.y + area.height - height);
  dockWindow.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
  dockWindow.setAlwaysOnTop(s.alwaysOnTop, 'floating');
  if (!smoke) dockWindow.showInactive();
  lastInside = Date.now();
}
function createDock() {
  dockWindow = secureWindow({ width: 740, height: 170, frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, hasShadow: false, show: false, skipTaskbar: true, focusable: false, alwaysOnTop: true });
  ignoreMouse = false;
  hitRegion = { x: 0, y: 0, width: 10000, height: 10000 };
  dockWindow.webContents.on('render-process-gone', () => { if (!quitting) refreshDock(); });
  dockWindow.webContents.on('unresponsive', () => { if (!quitting) refreshDock(); });
  load(dockWindow, '/dock');
  dockWindow.once('ready-to-show', layoutDock);
  dockWindow.on('closed', () => { dockWindow = undefined; });
  clearInterval(hoverTimer);
  hoverTimer = setInterval(() => {
    if (!dockWindow || smoke) return;
    const s = store.config.settings, point = screen.getCursorScreenPoint(), b = dockWindow.getBounds();
    const inside = point.x >= b.x + hitRegion.x - 8 && point.x <= b.x + hitRegion.x + hitRegion.width + 8 && point.y >= b.y + hitRegion.y - 8 && point.y <= b.y + hitRegion.y + hitRegion.height + 8;
    const nextIgnore = !inside;
    if (nextIgnore !== ignoreMouse) { ignoreMouse = nextIgnore; dockWindow.setIgnoreMouseEvents(ignoreMouse, { forward: true }); }
    if (inside || activeGroupId || contextOpen) lastInside = Date.now();
    if (!s.autoHide) return;
    const area = selectedDisplay().workArea;
    const onEdge = s.position === 'bottom' ? point.y >= area.y + area.height - 5 && point.x >= b.x && point.x <= b.x + b.width
      : s.position === 'top' ? point.y <= area.y + 5 && point.x >= b.x && point.x <= b.x + b.width
      : s.position === 'left' ? point.x <= area.x + 5 && point.y >= b.y && point.y <= b.y + b.height
      : point.x >= area.x + area.width - 5 && point.y >= b.y && point.y <= b.y + b.height;
    const withinDisplay = point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height;
    if (onEdge && withinDisplay) { dockWindow.showInactive(); dockWindow.webContents.send('dock:reveal'); lastInside = Date.now(); }
    else if (!inside && !activeGroupId && !contextOpen && Date.now() - lastInside > s.hideDelay) dockWindow.webContents.send('dock:conceal');
  }, 60);
}
function refreshDock() {
  closeGroup();
  groupWindow?.destroy(); groupWindow = undefined;
  dockWindow?.destroy(); createDock();
  if (!bridge.status.available && !smoke) void bridge.start().then(() => bridge.apply(store.config.settings)).then(broadcast).catch(report);
  else applySystem();
}
function updateTray() {
  if (smoke) return;
  if (!store.config.settings.showTray) { tray?.destroy(); tray = undefined; return; }
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), 'assets/app.png')).resize({ width: 24, height: 24 }));
    tray.setToolTip('dock_box · 你的桌面，你的节奏'); tray.on('double-click', () => openSettings());
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开控制中心', click: () => openSettings() },
    { label: '显示 Dock', click: () => { dockWindow?.showInactive(); lastInside = Date.now(); } },
    { label: '显示 / 隐藏桌面图标', enabled: bridge.status.available, click: () => { void bridge.request('toggleDesktop').catch(report); } },
    { type: 'separator' }, { label: '退出 dock_box', click: () => app.quit() },
  ]));
}
function report(error: unknown) { console.error(error); if (settingsWindow) void dialog.showMessageBox(settingsWindow, { type: 'error', title: '操作未完成', message: error instanceof Error ? error.message : String(error) }); }
function applySystem() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    const settings = { ...store.config.settings };
    applying = applying.then(async () => { if (!smoke) await bridge.apply(settings); broadcast(); }).catch(error => { bridge.status.message = String(error); broadcast(); });
  }, 180);
}
async function saveSettings(patch: Partial<Settings>) {
  const previous = store.config.settings;
  const next = normalizeSettings({ ...previous, ...patch });
  if (next.blockNetwork !== previous.blockNetwork && !smoke) {
    if (!app.isPackaged) throw new Error('请使用打包后的 dock_box 设置防火墙；开发运行时由多个项目共用。');
    if (!existsSync(nativePath)) throw new Error('Windows 原生组件未安装，无法设置防火墙。');
    await configureNetwork(next.blockNetwork);
  }
  if (next.launchOnStartup !== previous.launchOnStartup) {
    if (!app.isPackaged && next.launchOnStartup) throw new Error('请使用打包后的 dock_box 开启自启，开发模式不写入自启项。');
    if (process.platform === 'win32' && !smoke) {
      const startupPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
      app.setLoginItemSettings({ openAtLogin: next.launchOnStartup, path: startupPath, args: ['--autostart'] });
    }
  }
  store.save({ ...store.config, settings: next });
  if (next.detectUsb !== previous.detectUsb) usbDrives = [];
  closeGroup(); layoutDock(); updateTray(); applySystem(); broadcast(); return state();
}
function firewallPaths() { return [process.execPath, nativePath, process.env.PORTABLE_EXECUTABLE_FILE].filter((file): file is string => !!file); }
async function configureNetwork(enabled: boolean) {
  const file = path.join(app.getPath('userData'), 'firewall-programs.json');
  let previous: string[] = [];
  try { const saved = JSON.parse(readFileSync(file, 'utf8')); if (Array.isArray(saved)) previous = saved.filter(value => typeof value === 'string'); } catch { }
  const programs = enabled ? firewallPaths() : [...new Set([...firewallPaths(), ...previous])];
  await setFirewall(nativePath, enabled, programs);
  writeFileSync(file, JSON.stringify(enabled ? [...new Set([...previous, ...programs])] : []), 'utf8');
  networkStatus = enabled ? 'Windows 防火墙已阻止 dock_box 的所有入站与出站连接。' : '';
}
async function launchItem(id: string) {
  const item = findItem(store.config.items, id) || (store.config.settings.detectUsb ? usbDrives.filter(drive => drive.ready).map(drive => ({ id: `usb-${drive.path[0]}`, name: drive.name, kind: 'folder' as const, target: drive.path, glyph: 'files' as const, color: '#658a87' })).find(drive => drive.id === id) : undefined);
  if (!item) throw new Error('找不到这个项目。');
  if (item.kind === 'builtin' && item.target === 'settings') { openSettings(); return; }
  if (item.kind === 'group' || item.kind === 'separator') return;
  const target = resolveLaunch(item, { music: app.getPath('music'), pictures: app.getPath('pictures') });
  if (smoke) return;
  launching++;
  try {
    if (store.config.settings.systemLaunch && bridge.status.available) await bridge.request('launch', target as unknown as Record<string, unknown>);
    else if (target.url || target.target.startsWith('shell:')) await shell.openExternal(target.target);
    else { const error = await shell.openPath(target.target); if (error) throw new Error(error); }
  } finally { launching--; }
}
async function launchTaskManager() {
  if (smoke) return;
  const target = resolveLaunch({ id: 'taskmgr', name: '任务管理器', kind: 'builtin', target: 'taskmgr', glyph: 'box', color: '#658a87' }, {});
  if (bridge.status.available) await bridge.request('launch', { target: target.target });
  else { const error = await shell.openPath(target.target); if (error) throw new Error(error); }
}
async function itemFromPath(file: string): Promise<DockItem> {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !existsSync(file)) throw new Error('文件不存在。');
  const folder = statSync(file).isDirectory();
  const item: DockItem = { id: randomUUID(), name: path.basename(file, path.extname(file)), kind: folder ? 'folder' : 'app', target: file, glyph: folder ? 'folder' : 'box', color: '#a799df' };
  try { const icon = await app.getFileIcon(file, { size: 'large' }); if (!icon.isEmpty()) item.icon = icon.toDataURL(); } catch { }
  return item;
}
let scannedApps: DockItem[] | undefined;
let scanningApps: Promise<DockItem[]> | undefined;
async function scanApps(refresh = false): Promise<DockItem[]> {
  if (refresh) scannedApps = undefined;
  if (scannedApps) return scannedApps;
  if (scanningApps) return scanningApps;
  scanningApps = discoverApps().finally(() => { scanningApps = undefined; });
  return scanningApps;
}
async function discoverApps(): Promise<DockItem[]> {
  const roots = [...[process.env.APPDATA, process.env.ProgramData].filter(Boolean).map(p => path.join(p!, 'Microsoft/Windows/Start Menu/Programs')), app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')];
  const files: string[] = [];
  const walk = async (dir: string, depth: number, maxDepth: number) => {
    if (depth > maxDepth || files.length > 1000) return;
    try { for (const entry of await readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(file, depth + 1, maxDepth); else if (/\.(lnk|url|exe)$/i.test(entry.name) && !/uninstall|卸载/i.test(entry.name)) files.push(file); } } catch { }
  };
  const systemApps = bridge.status.available ? bridge.request('apps').then(result => result.apps as { name: string; target: string; icon?: string }[]).catch(() => []) : Promise.resolve([]);
  await Promise.all(roots.map((root, index) => walk(root, 0, index < roots.length - 2 ? 6 : 0)));
  const unique = new Map<string, DockItem>();
  let cursor = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < Math.min(files.length, 800)) {
      const file = files[cursor++];
      try { const item = await itemFromPath(file); const key = item.name.toLocaleLowerCase(); if (!unique.has(key)) unique.set(key, item); } catch { }
    }
  }));
  for (const entry of await systemApps) {
    if (!entry.name || /uninstall|卸载/i.test(entry.name) || unique.has(entry.name.toLocaleLowerCase())) continue;
    unique.set(entry.name.toLocaleLowerCase(), { id: randomUUID(), name: entry.name, kind: 'app', target: entry.target, icon: entry.icon || undefined, glyph: 'box', color: '#658a87' });
  }
  scannedApps = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')); return scannedApps;
}
function closeGroup() { activeGroupId = undefined; groupWindow?.hide(); lastInside = Date.now(); }
function openManager(page = 'apps', id?: string) {
  closeGroup();
  const route = `${page}/${id || ''}`;
  if (!managerWindow || managerWindow.isDestroyed()) {
    managerWindow = secureWindow({ width: 1000, height: 760, minWidth: 850, minHeight: 600, frame: false, backgroundColor: '#f2f4f5', show: false });
    load(managerWindow, `/manage/${route}`);
    managerWindow.once('ready-to-show', () => { if (!smoke) managerWindow?.show(); });
    managerWindow.on('closed', () => { managerWindow = undefined; });
  } else { managerWindow.webContents.send('page:open', route); if (!smoke) { managerWindow.show(); managerWindow.focus(); } }
}
function openGroup(id: string, rect: Electron.Rectangle) {
  const item = findItem(store.config.items, id);
  if (!item || item.kind !== 'group' || !dockWindow) return;
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return;
  if (activeGroupId === id) { closeGroup(); return; }
  const s = store.config.settings, bounds = dockWindow.getBounds(), area = selectedDisplay().workArea;
  const count = item.children?.length || 0;
  const width = Math.min(area.width - 16, s.groupLayout === 'grid' ? 374 : s.groupLayout === 'stack' ? 260 : 320);
  // Include the title, footer and padding so the first row never starts clipped.
  const height = Math.min(area.height - 32, s.groupLayout === 'grid' ? Math.max(270, Math.ceil(count / 4) * 94 + 170) : s.groupLayout === 'stack' ? Math.max(150, count * 44 + 100) : Math.max(250, count * 60 + 184), s.groupLayout === 'stack' ? area.height - 32 : 640);
  const cx = bounds.x + rect.x + rect.width / 2, cy = bounds.y + rect.y + rect.height / 2;
  let x = cx - width / 2, y = bounds.y + rect.y - height - 10;
  if (s.position === 'top') y = bounds.y + rect.y + rect.height + 10;
  if (s.position === 'left') { x = bounds.x + rect.x + rect.width + 10; y = cy - height / 2; }
  if (s.position === 'right') { x = bounds.x + rect.x - width - 10; y = cy - height / 2; }
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - width - 8));
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - height - 8));
  if (s.groupLayout === 'stack' && (s.position === 'bottom' || s.position === 'top')) x = Math.max(area.x + 8, Math.min(cx - width + 44, area.x + area.width - width - 8));
  const window = groupWindow || secureWindow({ width, height, transparent: true, backgroundColor: '#00000000', frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false });
  window.setBounds({ x: Math.round(x), y: Math.round(y), width, height });
  groupWindow = window;
  activeGroupId = id;
  const hash = `/group/${encodeURIComponent(id)}`;
  if (window.webContents.getURL().endsWith(`#${hash}`)) { if (!smoke) window.show(); broadcast(); }
  else if (window.webContents.getURL()) {
    // Hash-only navigation does not reload Chromium; the React router listens for this change.
    void window.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).then(() => { if (!smoke && activeGroupId === id && !window.isDestroyed()) window.show(); }).catch(report);
    broadcast();
  } else { load(window, hash); window.webContents.once('did-finish-load', () => { if (!smoke && activeGroupId === id && !window.isDestroyed()) window.show(); }); }
  if (window.listenerCount('blur') === 0) {
    window.on('blur', () => { if (!launching && !contextOpen) closeGroup(); });
    window.on('closed', () => { if (groupWindow === window) groupWindow = undefined; activeGroupId = undefined; lastInside = Date.now(); });
  }
}
function registerIpc() {
  const handle = (channel: string, callback: (...args: any[]) => any) => ipcMain.handle(channel, (event, ...args) => {
    if (!BrowserWindow.getAllWindows().some(w => w.webContents === event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Unauthorized IPC sender');
    return callback(...args);
  });
  handle('state:get', state);
  handle('settings:update', (patch) => {
    const operation = settingsSaving.then(() => saveSettings(patch && typeof patch === 'object' ? patch : {}));
    settingsSaving = operation.then(() => {}, () => {}); return operation;
  });
  handle('items:update', (items) => { store.save({ ...store.config, items: normalizeItems(items) }); layoutDock(); broadcast(); return state(); });
  handle('item:launch', launchItem);
  handle('group:open', openGroup); handle('group:close', closeGroup);
  handle('item:pick', async (folder) => {
    const result = await dialog.showOpenDialog(managerWindow || settingsWindow || dockWindow!, { title: folder ? '选择文件夹' : '添加应用或快捷方式', properties: folder ? ['openDirectory'] : ['openFile'], filters: folder ? undefined : [{ name: '应用与快捷方式', extensions: ['exe', 'lnk', 'url'] }, { name: '所有文件', extensions: ['*'] }] });
    return result.canceled ? null : itemFromPath(result.filePaths[0]);
  });
  handle('icon:pick', async () => {
    const result = await dialog.showOpenDialog(managerWindow || settingsWindow || dockWindow!, { title: '选择图标', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'ico', 'webp'] }] });
    if (result.canceled) return null;
    if (statSync(result.filePaths[0]).size > 10 * 1024 * 1024) throw new Error('请选择小于 10 MB 的图片。');
    const icon = nativeImage.createFromPath(result.filePaths[0]); if (icon.isEmpty()) throw new Error('无法读取此图片。');
    return icon.resize({ width: 128, height: 128, quality: 'best' }).toDataURL();
  });
  handle('items:importPaths', async (paths, groupId) => {
    if (!Array.isArray(paths)) return state();
    const added: DockItem[] = [];
    for (const file of paths.slice(0, 30)) added.push(await itemFromPath(file));
    const items = structuredClone(store.config.items);
    const group = groupId ? findItem(items, groupId) : undefined;
    if (group?.kind === 'group') group.children = [...group.children || [], ...added]; else items.push(...added);
    store.save({ ...store.config, items }); layoutDock(); broadcast(); return state();
  });
  handle('apps:scan', scanApps);
  handle('config:export', async () => { const result = await dialog.showSaveDialog(settingsWindow!, { title: '导出配置', defaultPath: 'dock_box-config.json', filters: [{ name: 'Dock Box 配置', extensions: ['json'] }] }); if (result.canceled || !result.filePath) return false; writeFileSync(result.filePath, JSON.stringify(store.config, null, 2), 'utf8'); return true; });
  handle('config:import', async () => {
    const result = await dialog.showOpenDialog(settingsWindow!, { title: '导入配置', properties: ['openFile'], filters: [{ name: 'Dock Box 配置', extensions: ['json'] }] });
    if (result.canceled) return null;
    if (statSync(result.filePaths[0]).size > 20 * 1024 * 1024) throw new Error('配置文件超过 20 MB。');
    const data = JSON.parse(readFileSync(result.filePaths[0], 'utf8'));
    if (data.version !== 1 || !data.settings || !Array.isArray(data.items)) throw new Error('这不是有效的 dock_box 配置文件。');
    const config = normalizeConfig(data);
    // Imported files change appearance and content; system integration is a local choice.
    const local = store.config.settings;
    for (const key of ['launchOnStartup','showTray','hideDesktopIcons','middleClickDesktop','taskbarStyle','screenCorners','blockNetwork','detectUsb','systemLaunch'] as const) (config.settings as any)[key] = local[key];
    store.save(config); layoutDock(); applySystem(); broadcast(); return state();
  });
  handle('config:reset', async () => { const result = await dialog.showMessageBox(settingsWindow!, { type: 'question', buttons: ['取消', '恢复默认'], defaultId: 0, cancelId: 0, message: '恢复默认布局和应用列表？', detail: '建议先导出配置，已有的个性化设置将被替换。' }); if (result.response !== 1) return null; const defaults = createDefaultConfig(); await saveSettings(defaults.settings); store.save(defaults); layoutDock(); broadcast(); return state(); });
  handle('desktop:restore', () => saveSettings({ hideDesktopIcons: false, middleClickDesktop: false, taskbarStyle: 'system', screenCorners: false }));
  handle('window:settings', openSettings);
  handle('window:manager', openManager);
  ipcMain.handle('window:action', (event, action) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Unauthorized IPC sender');
    if (action === 'quit') app.quit(); else if (action === 'minimize') window.minimize(); else if (action === 'close') window.close();
  });
  handle('dock:refresh', refreshDock);
  handle('link:repo', () => shell.openExternal('https://github.com/futao-awa/Dock_box'));
  handle('dock:context', (id) => {
    const item = id ? findItem(store.config.items, id) : undefined;
    const entries: Electron.MenuItemConstructorOptions[] = [];
    if (item && item.kind !== 'separator') entries.push({ label: item.name, enabled: false }, { type: 'separator' });
    entries.push({ label: '刷新 Dock', click: refreshDock }, { label: '任务管理器', click: () => { void launchTaskManager().catch(report); } }, { type: 'separator' },
      { label: '图标设置', click: () => openManager('icons', item?.id) },
      { label: '添加应用', click: () => openManager('apps') }, { label: '分类管理', click: () => openManager('groups', item?.kind === 'group' ? item.id : undefined) },
      { label: 'Dock 外观设置', click: () => openSettings('appearance') }, { label: '打开控制中心', click: () => openSettings() });
    if (item && !item.children) entries.push({ label: '从 Dock 移除', click: () => { store.save({ ...store.config, items: removeItem(store.config.items, id) }); layoutDock(); broadcast(); } });
    entries.push({ type: 'separator' }, { label: '退出 dock_box', click: () => app.quit() });
    contextOpen = true;
    Menu.buildFromTemplate(entries).popup({ window: activeGroupId ? groupWindow : dockWindow, callback: () => { contextOpen = false; lastInside = Date.now(); } });
  });
  ipcMain.on('dock:hit-region', (event, rect) => { if (event.sender === dockWindow?.webContents && rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) hitRegion = rect; });
}
async function start() {
  app.setAppUserModelId('com.futao.dockbox');
  store = new ConfigStore(app.getPath('userData'));
  nativePath = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath() + '/resources', 'native/DockBox.Native.exe');
  bridge = new NativeBridge(nativePath);
  installNetworkGuard(() => store.config.settings.blockNetwork, devUrl);
  if (store.config.settings.blockNetwork && !smoke) {
    const file = path.join(app.getPath('userData'), 'firewall-programs.json');
    let saved: string[] = [];
    try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch { }
    if (!Array.isArray(saved) || firewallPaths().some(file => !saved.includes(file))) {
      networkStatus = '程序路径已变化，正在更新 Windows 防火墙规则…';
      void configureNetwork(true).then(broadcast).catch(error => { networkStatus = String(error); broadcast(); });
    } else networkStatus = 'Windows 防火墙已阻止 dock_box 的所有入站与出站连接。';
  }
  registerIpc(); createDock(); updateTray();
  if (!process.argv.includes('--autostart') || smoke) openSettings();
  bridge.on('usbDrives', drives => { usbDrives = drives; layoutDock(); broadcast(); });
  bridge.on('desktopVisibility', (hidden: boolean) => { store.save({ ...store.config, settings: { ...store.config.settings, hideDesktopIcons: hidden } }); broadcast(); });
  bridge.on('status', () => broadcast());
  await bridge.start();
  // Respect desktop icons that were already hidden before Dock Box started.
  if (bridge.status.available && bridge.status.desktopHidden && !store.config.settings.hideDesktopIcons) {
    store.save({ ...store.config, settings: { ...store.config.settings, hideDesktopIcons: true } });
  }
  if (!smoke) await bridge.apply(store.config.settings);
  broadcast(); updateTray();
  if (!smoke) globalShortcut.register('CommandOrControl+Shift+D', () => openSettings());
  const displayChanged = () => { closeGroup(); layoutDock(); broadcast(); };
  screen.on('display-added', displayChanged);
  screen.on('display-removed', displayChanged);
  screen.on('display-metrics-changed', displayChanged);
  if (store.recoveryMessage && !smoke) void dialog.showMessageBox({ type: 'warning', message: store.recoveryMessage });
}
app.on('window-all-closed', () => { /* Dock and tray own the application lifetime. */ });
app.on('before-quit', (event) => {
  if (quitReady) return;
  event.preventDefault(); if (quitting) return; quitting = true;
  clearInterval(hoverTimer); clearTimeout(applyTimer); globalShortcut.unregisterAll();
  void applying.finally(async () => { await bridge?.stop(); tray?.destroy(); quitReady = true; app.quit(); });
});
