import { createDefaultConfig, normalizeConfig, type AppState, type DockItem, type Settings, type InstalledApp, type BitDockPreview } from '../shared/model';

export interface DockApi {
  getState(): Promise<AppState>;
  updateSettings(patch: Partial<Settings>): Promise<AppState>;
  updateItems(items: DockItem[]): Promise<AppState>;
  launch(id: string): Promise<void>;
  openGroup(id: string, rect: { x: number; y: number; width: number; height: number }): Promise<void>;
  closeGroup(): Promise<void>;
  pickApp(folder?: boolean): Promise<DockItem | null>;
  pickIcon(): Promise<string | null>;
  importPaths(files: File[], groupId?: string): Promise<AppState>;
  scanApps(refresh?: boolean): Promise<InstalledApp[]>;
  previewBitDock(choose?: 'file' | 'folder'): Promise<BitDockPreview | null>;
  applyBitDock(token: string, mode: 'append' | 'replace', appearance: boolean): Promise<{ state: AppState; backup: string }>;
  importConfig(): Promise<AppState | null>;
  exportConfig(): Promise<boolean>;
  resetConfig(): Promise<AppState | null>;
  restoreDesktop(): Promise<AppState>;
  openSettings(page?: string): Promise<void>;
  openManager(page?: string, id?: string): Promise<void>;
  refreshDock(): Promise<void>;
  onDockVisibility(callback: (visible: boolean) => void): () => void;
  windowAction(action: 'close' | 'minimize' | 'quit'): Promise<void>;
  contextMenu(id?: string): Promise<void>;
  setHitRegion(rect: { x: number; y: number; width: number; height: number }): void;
  openRepo(): Promise<void>;
  onState(callback: (state: AppState) => void): () => void;
  onPage(callback: (page: string) => void): () => void;
}
declare global { interface Window { dockBox?: DockApi } }
const unavailable = async (): Promise<never> => { throw new Error('此功能需要 Windows 桌面版。浏览器中可以预览外观与交互。'); };
function previewState(): AppState {
  let config = createDefaultConfig();
  try { const saved = localStorage.getItem('dock_box-preview'); if (saved) config = normalizeConfig(JSON.parse(saved)); } catch { }
  return { config, version: '1.0.0', preview: true, displays: [{ id: 'primary', name: '主显示器', primary: true, width: 1920, height: 1080 }], native: { available: false, message: '浏览器预览 · Windows 功能请使用桌面版', desktopHidden: false, taskbarSupported: false } };
}
function savePreview(state: AppState) { localStorage.setItem('dock_box-preview', JSON.stringify(state.config)); return state; }
const previewApi: DockApi = {
  getState: async () => previewState(),
  updateSettings: async patch => { const s = previewState(); s.config = normalizeConfig({ ...s.config, settings: { ...s.config.settings, ...patch } }); return savePreview(s); },
  updateItems: async items => { const s = previewState(); s.config = normalizeConfig({ ...s.config, items }); return savePreview(s); },
  launch: unavailable, openGroup: unavailable, closeGroup: async () => {}, pickApp: unavailable, pickIcon: unavailable,
  importPaths: unavailable, scanApps: unavailable, importConfig: unavailable, exportConfig: unavailable,
  previewBitDock: unavailable, applyBitDock: unavailable,
  resetConfig: async () => { const s = previewState(); s.config = createDefaultConfig(); return savePreview(s); },
  restoreDesktop: unavailable, openSettings: async page => { location.hash = `/settings/${page || ''}`; }, openManager: async (page, id) => { location.hash = `/manage/${page || 'apps'}/${id || ''}`; location.reload(); }, refreshDock: async () => {}, onDockVisibility: () => () => {}, windowAction: unavailable, contextMenu: async () => {},
  setHitRegion: () => {}, openRepo: async () => { window.open('https://github.com/futao-awa/Dock_box', '_blank', 'noopener,noreferrer'); }, onState: () => () => {}, onPage: () => () => {},
};
export const api = window.dockBox || previewApi;
