import { useEffect, useState } from 'react';
import { FolderOpen, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { api } from './api';
import { useStore } from './store';
import { IconTile } from './components';
import type { BitDockPreview } from '../shared/model';

export function BitDockImport({ onClose }: { onClose: () => void }) {
  const { setState, toast } = useStore();
  const [preview, setPreview] = useState<BitDockPreview>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append'), [appearance, setAppearance] = useState(false);
  const load = async (choose?: 'file' | 'folder') => {
    setBusy(true); setError('');
    try { const value = await api.previewBitDock(choose); if (value) setPreview(value); }
    catch (error) { setError(String(error).replace(/^Error: Error invoking remote method '[^']+': Error: /, '')); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const apply = async () => {
    if (!preview) return; setBusy(true); setError('');
    try { const result = await api.applyBitDock(preview.token, mode, appearance); setState(result.state); toast('BitDock 导入完成，原配置已自动备份。'); onClose(); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop"><section className="modal bitdock-modal" role="dialog" aria-modal="true" aria-label="导入 BitDock">
    <button className="modal-close icon-button" disabled={busy} aria-label="关闭 BitDock 导入" onClick={onClose}><X size={18}/></button>
    <span className="eyebrow">BRING YOUR DESKTOP WITH YOU</span><h2>把熟悉的 Dock 带过来。</h2>
    <p>读取 BitDock 主栏、分类、顺序和自定义图标。导入前自动备份当前配置，BitDock 原数据保持完整。</p>
    <div className="installed-actions"><button className="button" disabled={busy} onClick={() => void load()}><RefreshCw size={14}/>自动检测</button><button className="button" disabled={busy} onClick={() => void load('folder')}><FolderOpen size={14}/>选择数据目录</button><button className="button" disabled={busy} onClick={() => void load('file')}>选择 BitDock.xml</button></div>
    {busy && <p className="import-progress" role="status"><LoaderCircle size={16} className="spinning"/>正在读取并整理图标…</p>}
    {error && <p role="alert" className="import-error">{error}</p>}
    {preview && <><p className="import-source" title={preview.source}>{preview.source}</p><div className="import-summary"><strong>{preview.itemCount} 个入口</strong><span>{preview.groupCount} 个分类</span><span>{preview.iconCount} 个原有图标</span></div>
      <div className="import-items">{preview.items.map(item => <div key={item.id}><IconTile item={item} size={32}/><span><strong>{item.name}</strong>{item.kind === 'group' && <small>{item.children?.length || 0} 个入口</small>}</span></div>)}</div>
      {preview.warnings.length > 0 && <details className="import-warnings"><summary>{preview.warnings.length} 条迁移说明（含未支持功能和失效路径）</summary><ul>{preview.warnings.map((message, index) => <li key={index}>{message}</li>)}</ul></details>}
      <fieldset disabled={busy} className="import-options"><legend>导入方式</legend><label><input type="radio" name="import-mode" checked={mode === 'append'} onChange={() => setMode('append')}/>添加到现有 Dock（已导入分类自动跳过）</label><label><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')}/>替换主栏和分类（原配置可从备份恢复）</label><label><input type="checkbox" checked={appearance} onChange={event => setAppearance(event.target.checked)}/>同时迁移兼容的外观设置</label></fieldset>
      <p className="import-footnote">自动备份位于配置目录 backups；可通过“导入已有配置”恢复。开机自启、网络和系统美化开关沿用当前设置。</p>
    </>}
    <div className="modal-actions"><button className="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy || !preview?.itemCount} onClick={() => void apply()}>确认导入</button></div>
  </section></div>;
}
