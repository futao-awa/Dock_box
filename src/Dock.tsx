import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { ArrowUpRight, ChevronDown, Plus, X } from 'lucide-react';
import { magnify, findItem, type DockItem } from '../shared/model';
import { useStore } from './store';
import { api } from './api';
import { IconTile } from './components';

export function DockStrip({ preview = false, compact = false }: { preview?: boolean; compact?: boolean }) {
  const { state, run, items: saveItems } = useStore();
  const s = state.config.settings;
  const strip = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState<number | null>(null);
  const [bouncing, setBouncing] = useState('');
  const [previewGroup, setPreviewGroup] = useState<DockItem>();
  const [dragged, setDragged] = useState<string>();
  const vertical = !compact && (s.position === 'left' || s.position === 'right');
  const displayItems: DockItem[] = [...state.config.items, ...(s.detectUsb ? (state.usbDrives || []).filter(drive => drive.ready).map(drive => ({ id: `usb-${drive.path[0]}`, name: drive.name, kind: 'folder' as const, target: drive.path, glyph: 'files' as const, color: '#658a87' })) : [])];
  const count = displayItems.length;
  const available = preview ? (compact ? 630 : vertical ? 155 : 720) : (vertical ? window.innerHeight : window.innerWidth) - 64;
  const fit = Math.min(1, available / Math.max(1, count * (s.iconSize * s.zoom / 100 + s.gap)));
  const size = Math.max(preview ? 14 : 16, s.iconSize * s.zoom / 100 * fit * (compact ? .88 : 1));
  const gap = s.gap * fit;
  useEffect(() => {
    if (preview || !strip.current) return;
    const update = () => {
      if (!strip.current) return;
      const r = strip.current.getBoundingClientRect();
      const growth = s.reduceMotion || s.hoverEffect === 'none' ? 0 : size * (s.magnification - 1);
      const along = growth / 2 + 4, across = growth + 16;
      const left = Math.max(0, r.left - (vertical ? across : along));
      const top = Math.max(0, r.top - (vertical ? along : across));
      api.setHitRegion({ x: left, y: top, width: Math.min(window.innerWidth, r.right + (vertical ? across : along)) - left, height: Math.min(window.innerHeight, r.bottom + (vertical ? along : across)) - top });
    };
    update(); const observer = new ResizeObserver(update); observer.observe(strip.current); return () => observer.disconnect();
  }, [preview, size, vertical, s, count]);
  useEffect(() => { if (!bouncing) return; const timer = setTimeout(() => setBouncing(''), 650); return () => clearTimeout(timer); }, [bouncing]);
  const activate = (item: DockItem, element: HTMLElement) => {
    if (!s.reduceMotion) setBouncing(item.id);
    if (item.kind === 'group') {
      if (preview) setPreviewGroup(previewGroup?.id === item.id ? undefined : item);
      else { const r = element.getBoundingClientRect(); void run(() => api.openGroup(item.id, { x: r.x, y: r.y, width: r.width, height: r.height })); }
    } else if (!preview) void run(() => api.launch(item.id));
  };
  const drop = (event: React.DragEvent, targetId?: string) => {
    event.preventDefault();
    if (preview) return;
    if (event.dataTransfer.files.length) { const target = state.config.items.find(item => item.id === targetId); void run(() => api.importPaths(Array.from(event.dataTransfer.files), target?.kind === 'group' ? target.id : undefined)); return; }
    const id = event.dataTransfer.getData('application/dock-box-item');
    if (!id || id === targetId) return;
    const next = [...state.config.items], from = next.findIndex(i => i.id === id), to = next.findIndex(i => i.id === targetId);
    if (from >= 0 && to >= 0) { const [item] = next.splice(from, 1); next.splice(to, 0, item); void saveItems(next); }
    setDragged(undefined);
  };
  const dockStyle = { '--dock-alpha': s.opacity / 100, '--dock-radius': `${s.radius}px`, '--icon-size': `${size}px`, '--dock-gap': `${gap}px`, '--label-size': `${s.fontSize}px`, fontFamily: s.fontFamily } as CSSProperties;
  const movePointer = (event: MouseEvent<HTMLDivElement>) => {
    const element = strip.current;
    if (!element) return;
    const coordinate = vertical ? event.clientY : event.clientX;
    const centers = Array.from(element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('dock-item'))
      .map(child => {
        const rect = child.getBoundingClientRect();
        return vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
      });
    if (!centers.length) { setPointer(null); return; }
    if (centers.length === 1) { setPointer(0); return; }
    if (coordinate <= centers[0]) {
      setPointer((coordinate - centers[0]) / (centers[1] - centers[0]));
      return;
    }
    for (let index = 0; index < centers.length - 1; index++) {
      if (coordinate <= centers[index + 1]) {
        const span = centers[index + 1] - centers[index];
        setPointer(index + (span ? (coordinate - centers[index]) / span : 0));
        return;
      }
    }
    const last = centers.length - 1;
    setPointer(last + (coordinate - centers[last]) / (centers[last] - centers[last - 1]));
  };
  let iconIndex = 0;
  return <div className={`dock-composition ${vertical ? 'vertical' : ''} ${s.iconReflection ? 'with-reflection' : ''} ${s.reduceMotion ? 'reduce-motion' : ''}`} style={dockStyle}>
    {previewGroup && <div className="preview-group"><div><strong>{previewGroup.name}</strong><button aria-label="收起分类" onClick={() => setPreviewGroup(undefined)}><X size={14}/></button></div><section>{previewGroup.children?.map(child => <span key={child.id}><IconTile item={child} size={31}/><small>{child.name}</small></span>)}</section></div>}
    <div ref={strip} className={`dock-strip theme-${s.theme} ${vertical ? 'vertical' : ''}`} onContextMenu={e => { if (!preview) { e.preventDefault(); e.stopPropagation(); void api.contextMenu(); } }} onDragOver={e => e.preventDefault()} onDrop={e => drop(e)} onMouseLeave={() => setPointer(null)} onMouseMove={movePointer}>
      {displayItems.map((item, index) => {
        if (item.kind === 'separator') return <span key={item.id} className="dock-separator" style={{ width: vertical ? size : size / 3, height: vertical ? size / 3 : size * .55 }} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); drop(e, item.id); }}/>;
        // Centers are measured from the actual elements because separators have a different width.
        const currentIconIndex = iconIndex++;
        const distance = pointer === null ? 100 : pointer - currentIconIndex;
        const scale = magnify(distance, s);
        const lift = (scale - 1) * size * .36;
        const translation = compact || s.position === 'bottom' ? `translateY(${-lift}px)` : s.position === 'top' ? `translateY(${lift}px)` : s.position === 'left' ? `translateX(${lift}px)` : `translateX(${-lift}px)`;
        return <button key={item.id} className={`dock-item ${dragged === item.id ? 'dragging' : ''}`} aria-label={item.name} draggable={!preview && !item.id.startsWith('usb-')} onDragStart={e => { e.dataTransfer.setData('application/dock-box-item', item.id); setDragged(item.id); }} onDragEnd={() => setDragged(undefined)} onDrop={e => { e.stopPropagation(); drop(e, item.id); }} onClick={e => activate(item, e.currentTarget)} onContextMenu={e => { if (!preview) { e.preventDefault(); e.stopPropagation(); void api.contextMenu(item.id); } }} style={{ '--item-scale': scale, transform: `${translation} scale(${scale})`, zIndex: Math.round(scale * 10), width: size, height: size } as CSSProperties}>
          <span className={bouncing === item.id ? `click-${s.clickEffect}` : ''}><IconTile item={item} size={size}/></span>
          {s.showLabels && <span className={`dock-label label-${compact ? 'bottom' : s.position}`}>{item.name}</span>}
          {item.kind === 'group' && <span className="dock-group-indicator"/>}
        </button>;
      })}
      {!count && <button className="empty-dock" onClick={() => void api.openManager('apps')}><Plus size={23}/><span>添加应用</span></button>}
    </div>
  </div>;
}
export function DockWindow() {
  const { state } = useStore();
  const [hidden, setHidden] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [welcome, setWelcome] = useState(!!state.autostart && state.config.settings.startupAnimation && !state.config.settings.reduceMotion);
  useEffect(() => api.onDockVisibility(setVisible => setHidden(!setVisible)), []);
  useEffect(() => { if (!state.config.settings.autoHide) setHidden(false); }, [state.config.settings.autoHide]);
  useEffect(() => { if (!welcome) return; const timer = setTimeout(() => setWelcome(false), 1800); return () => clearTimeout(timer); }, [welcome]);
  useEffect(() => { if (hidden && trigger.current) { const rect = trigger.current.getBoundingClientRect(); api.setHitRegion({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }); } }, [hidden, state.config.settings.position]);
  useEffect(() => { document.body.classList.add('transparent-window'); return () => document.body.classList.remove('transparent-window'); }, []);
  return <main className={`desktop-dock position-${state.config.settings.position} ${welcome ? 'startup-animation' : ''}`} style={{ '--trigger-color': state.config.settings.triggerColor } as CSSProperties} onContextMenu={e => { e.preventDefault(); void api.contextMenu(); }}>
    {hidden ? <button ref={trigger} className="dock-trigger" aria-label="显示 Dock" onMouseEnter={() => setHidden(false)} onClick={() => setHidden(false)}/> : <DockStrip/>}
    {welcome && <span className="startup-welcome">dock_box · 桌面已就绪</span>}
  </main>;
}
export function GroupWindow({ id }: { id: string }) {
  const { state, run } = useStore();
  const group = findItem(state.config.items, id);
  useEffect(() => { document.body.classList.add('transparent-window'); const key = (e: KeyboardEvent) => { if (e.key === 'Escape') void api.closeGroup(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, []);
  return <main className={`group-window group-${state.config.settings.groupLayout} theme-${state.config.settings.theme} ${state.config.settings.reduceMotion ? 'reduce-motion' : ''}`} style={{ fontFamily: state.config.settings.fontFamily, '--label-size': `${state.config.settings.fontSize}px` } as CSSProperties} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void run(() => api.importPaths(Array.from(e.dataTransfer.files), id)); }}>
    <header><div><span className="eyebrow">应用分类</span><h2>{group?.name || '应用分类'}<small>{group?.children?.length || 0}</small></h2></div><button className="icon-button" onClick={() => void api.closeGroup()} aria-label="关闭分类"><ChevronDown size={18}/></button></header>
    <section className={`group-items layout-${state.config.settings.groupLayout}`}>{group?.children?.map((child, index) => child.kind === 'separator' ? <hr className="group-separator" key={child.id}/> : <button key={child.id} aria-label={child.name} style={{ '--item-index': index } as CSSProperties} onContextMenu={e => { e.preventDefault(); void run(() => api.contextMenu(child.id)); }} onClick={() => void run(async () => { await api.launch(child.id); await api.closeGroup(); })}><IconTile item={child} size={42}/><span>{child.name}</span>{state.config.settings.groupLayout !== 'grid' && <ArrowUpRight size={14}/>}</button>)}</section>
    {!group?.children?.length && <div className="empty-state"><Plus/><p>把应用拖到这里<br/>或在应用管理中添加</p></div>}
    <footer><span>{group?.children?.length || 0} 个项目</span><button className="text-button" onClick={() => void api.openManager('groups', id)}>管理分类<ArrowUpRight size={13}/></button></footer>
  </main>;
}
export function DesktopPreview({ hero = false }: { hero?: boolean }) {
  const { state } = useStore();
  return <div className={`desktop-preview ${hero ? 'hero-preview' : 'live-preview'} theme-scene-${state.config.settings.theme}`}>
    <div className="scene-orb orb-one"/><div className="scene-orb orb-two"/><div className="scene-hill hill-back"/><div className="scene-hill hill-front"/>
    <span className="preview-caption"><span/> {hero ? '属于你的桌面风景' : '实时预览 · 悬停试试'}</span>
    {hero && <div className="hero-copy"><span>A LITTLE SPACE, ALL YOURS.</span><h2>把喜欢的，<br/>留在手边。</h2><p>简洁，有序，还有一点点心动。</p></div>}
    {!hero && <div className="preview-clock">09:41<span>星期一 · 好心情，从桌面开始</span></div>}
    {hero && <div className="hero-decoration"><span className="floating-card card-music"><MusicNote/>正在播放好心情<i/></span><span className="floating-card card-spark">✧<small>Make room<br/>for inspiration.</small></span></div>}
    <div className={`preview-dock ${hero ? 'position-bottom' : `position-${state.config.settings.position}`}`}><DockStrip preview compact={hero}/></div>
    {hero && <span className="hero-badge">DESIGNED AROUND YOU <ArrowUpRight size={12}/></span>}
  </div>;
}
function MusicNote() { return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/></svg>; }
