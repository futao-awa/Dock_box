import { type CSSProperties, type ReactNode, useId } from 'react';
import { Folder, Globe2, Code2, Music2, Image, Terminal, Settings2, Trash2, Gamepad2, MessageCircle, Boxes, Files, Plus, Check, ArrowUpRight } from 'lucide-react';
import type { DockItem, Glyph } from '../shared/model';

export const glyphMap = { folder: Folder, browser: Globe2, code: Code2, music: Music2, image: Image, terminal: Terminal, settings: Settings2, trash: Trash2, game: Gamepad2, chat: MessageCircle, box: Boxes, files: Files, globe: Globe2, plus: Plus };
export function Logo({ small = false }: { small?: boolean }) { return <span className={`logo-mark ${small ? 'small' : ''}`} aria-hidden="true"><i/><i/><i/><i/></span>; }
export function IconTile({ item, size = 44 }: { item: Pick<DockItem, 'glyph' | 'color' | 'icon' | 'kind'>; size?: number }) {
  const Icon = glyphMap[item.glyph as Glyph] || Boxes;
  return <span className={`icon-tile ${item.icon ? 'custom' : ''} glyph-${item.glyph}`} style={{ '--tile-color': item.color, width: size, height: size } as CSSProperties}>
    {item.icon ? <img src={item.icon} alt="" draggable={false}/> : <Icon size={size * .55} strokeWidth={1.75}/>}
    {item.kind === 'group' && <span className="group-dot"><Plus size={8}/></span>}
  </span>;
}
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (x: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`toggle ${checked ? 'on' : ''}`}><span>{checked && <Check size={10}/>}</span></button>;
}
export function Slider({ label, value, min, max, step = 1, unit = 'px', onChange, description }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; description?: string }) {
  const id = useId();
  return <div className="slider-control"><div className="control-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{Math.round(value * 100) / 100}<span>{unit}</span></output></div>{description && <p>{description}</p>}<input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ '--progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties}/><div className="range-labels"><span>{min}{unit}</span><span>{max}{unit}</span></div></div>;
}
export function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const id = useId(); return <div className="select-control"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
}
export function SettingRow({ icon, title, description, children, muted }: { icon?: ReactNode; title: string; description?: string; children: ReactNode; muted?: boolean }) {
  return <div className={`setting-row ${muted ? 'muted' : ''}`}>{icon && <span className="row-icon">{icon}</span>}<div className="row-copy"><strong>{title}</strong>{description && <p>{description}</p>}</div><div className="row-action">{children}</div></div>;
}
export function Card({ title, subtitle, action, children, className = '' }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{title && <div className="card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>}{children}</section>;
}
export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</header>;
}
export function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-button" onClick={onClick}>{children}<ArrowUpRight size={15}/></button>; }
