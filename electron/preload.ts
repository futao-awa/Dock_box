import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { Settings, DockItem } from '../shared/model';

contextBridge.exposeInMainWorld('dockBox', {
  getState: () => ipcRenderer.invoke('state:get'),
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:update', patch),
  updateItems: (items: DockItem[]) => ipcRenderer.invoke('items:update', items),
  launch: (id: string) => ipcRenderer.invoke('item:launch', id),
  openGroup: (id: string, rect: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('group:open', id, rect),
  closeGroup: () => ipcRenderer.invoke('group:close'),
  pickApp: (folder = false) => ipcRenderer.invoke('item:pick', folder),
  pickIcon: () => ipcRenderer.invoke('icon:pick'),
  importPaths: (files: File[], groupId?: string) => ipcRenderer.invoke('items:importPaths', files.map(file => webUtils.getPathForFile(file)), groupId),
  scanApps: (refresh = false) => ipcRenderer.invoke('apps:scan', refresh),
  importConfig: () => ipcRenderer.invoke('config:import'),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  restoreDesktop: () => ipcRenderer.invoke('desktop:restore'),
  openSettings: (page?: string) => ipcRenderer.invoke('window:settings', page),
  openManager: (page?: string, id?: string) => ipcRenderer.invoke('window:manager', page, id),
  refreshDock: () => ipcRenderer.invoke('dock:refresh'),
  onDockVisibility: (callback: (visible: boolean) => void) => {
    const reveal = () => callback(true), conceal = () => callback(false);
    ipcRenderer.on('dock:reveal', reveal); ipcRenderer.on('dock:conceal', conceal);
    return () => { ipcRenderer.removeListener('dock:reveal', reveal); ipcRenderer.removeListener('dock:conceal', conceal); };
  },
  windowAction: (action: 'close' | 'minimize' | 'quit') => ipcRenderer.invoke('window:action', action),
  contextMenu: (id?: string) => ipcRenderer.invoke('dock:context', id),
  setHitRegion: (rect: { x: number; y: number; width: number; height: number }) => ipcRenderer.send('dock:hit-region', rect),
  openRepo: () => ipcRenderer.invoke('link:repo'),
  onState: (callback: (state: unknown) => void) => { const listener = (_: unknown, state: unknown) => callback(state); ipcRenderer.on('state:changed', listener); return () => ipcRenderer.removeListener('state:changed', listener); },
  onPage: (callback: (page: string) => void) => { const listener = (_: unknown, page: string) => callback(page); ipcRenderer.on('page:open', listener); return () => ipcRenderer.removeListener('page:open', listener); },
});
