import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { AppState, DockItem, Settings } from '../shared/model';

interface Store { state: AppState; setState: (s: AppState) => void; update: (p: Partial<Settings>) => void; items: (items: DockItem[]) => Promise<void>; toast: (text: string, error?: boolean) => void; run: <T>(task: () => Promise<T>, message?: string) => Promise<T | undefined> }
const Context = createContext<Store | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>();
  const [notice, setNotice] = useState<{ text: string; error: boolean; key: number }>();
  const toast = useCallback((text: string, error = false) => setNotice({ text, error, key: Date.now() }), []);
  useEffect(() => { api.getState().then(setState).catch(error => toast(String(error), true)); return api.onState(setState); }, [toast]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(undefined), notice.error ? 6500 : 3200); return () => clearTimeout(timer); } }, [notice]);
  const run = useCallback(async <T,>(task: () => Promise<T>, message?: string) => { try { const value = await task(); if (message) toast(message); return value; } catch (error) { toast(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(error), true); } }, [toast]);
  if (!state) return <div className="loading"><span className="logo-mark"><i/><i/><i/><i/></span><span>正在整理你的桌面…</span>{notice && <p>{notice.text}</p>}</div>;
  const update = (patch: Partial<Settings>) => {
    setState(current => current ? { ...current, config: { ...current.config, settings: { ...current.config.settings, ...patch } } } : current);
    void run(async () => { try { setState(await api.updateSettings(patch)); } catch (error) { setState(await api.getState()); throw error; } });
  };
  const items = async (next: DockItem[]) => { await run(async () => { setState(await api.updateItems(next)); }); };
  return <Context.Provider value={{ state, setState, update, items, toast, run }}>{children}{notice && <div key={notice.key} role={notice.error ? 'alert' : 'status'} className={`toast ${notice.error ? 'error' : ''}`} onClick={() => setNotice(undefined)}>{notice.error ? '!' : '✓'}<span>{notice.text}</span></div>}</Context.Provider>;
}
export function useStore() { const context = useContext(Context); if (!context) throw new Error('AppProvider is missing'); return context; }
