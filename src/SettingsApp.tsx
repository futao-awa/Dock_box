import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, SlidersHorizontal, Sparkles, AppWindow, Monitor, Settings2, Search, Minus, X, ArrowUpRight, Check, ChevronRight, CircleHelp, Zap, Layers3, Move, MousePointer2, Palette, RotateCcw, Download, Upload, Github, Power, Eye, PanelBottom, CornerUpLeft, Mouse, ShieldCheck, CheckCircle2, Keyboard, Heart, Bell, Rocket, Type, Volume2 } from 'lucide-react';
import { useStore } from './store';
import { api } from './api';
import { Card, Logo, PageHeader, SettingRow, Slider, Toggle, Select, LinkButton } from './components';
import { DesktopPreview } from './Dock';
import { AppsPage } from './apps';
import type { Settings, Theme } from '../shared/model';

export const themes: { id: Theme; name: string; description: string; swatch: string }[] = [
  { id: 'glass', name: '雾屿', description: '轻盈磨砂 · 温柔紫调', swatch: 'linear-gradient(135deg,#d3dcf4,#d7cce9 54%,#f1dadd)' },
  { id: 'cloud', name: '云间', description: '纯净留白 · 清新明亮', swatch: 'linear-gradient(135deg,#d4e7ee,#eef2ec 52%,#fbf8ef)' },
  { id: 'midnight', name: '夜航', description: '深邃通透 · 静谧时刻', swatch: 'linear-gradient(135deg,#333a59,#666084 55%,#958298)' },
  { id: 'rose', name: '落樱', description: '微甜暖粉 · 浪漫日常', swatch: 'linear-gradient(135deg,#e5cad8,#eed9d5 55%,#eddfef)' },
];
const navigation = [
  { id: 'home', label: '桌面总览', en: 'Overview', icon: LayoutDashboard, keywords: '主页 首页' },
  { id: 'appearance', label: 'Dock 外观', en: 'Appearance', icon: SlidersHorizontal, keywords: '位置 缩放 边距 偏移 图标 大小 字体 名称 透明度 风格 主题 圆角 显示器' },
  { id: 'behavior', label: '动效与交互', en: 'Motion', icon: Sparkles, keywords: '放大效果 范围 弹跳 悬停 自动隐藏 延迟 分类 展开 置顶 减少动画' },
  { id: 'apps', label: '应用与分类', en: 'Applications', icon: AppWindow, keywords: '添加应用 图标 分组 文件夹 网址 拖拽 编辑 排序' },
  { id: 'desktop', label: '桌面美化', en: 'Desktop', icon: Monitor, keywords: '隐藏桌面软件图标 任务栏 透明 颜色 屏幕圆角 鼠标中键' },
  { id: 'general', label: '通用设置', en: 'General', icon: Settings2, keywords: '管理面板 自启 动画 托盘 导入 导出 配置 重置 快捷键 关于 U盘 USB 系统接口 启动 联网 防火墙 触发条 倒影' },
];
type Page = typeof navigation[number]['id'];
export function SettingsApp() {
  const { state, run } = useStore();
  const [page, setPage] = useState<Page>(location.hash.split('/')[2] || 'home');
  const [search, setSearch] = useState('');
  const [help, setHelp] = useState(false);
  const navigate = (next: string) => { setPage(navigation.some(n => n.id === next) ? next : 'home'); setSearch(''); document.querySelector('.main-scroll')?.scrollTo(0, 0); };
  useEffect(() => api.onPage(navigate), []);
  const matches = search.trim() ? navigation.filter(n => `${n.label} ${n.en} ${n.keywords}`.toLowerCase().includes(search.toLowerCase().trim())) : [];
  const current = navigation.find(n => n.id === page) || navigation[0];
  return <div className={`settings-app ${state.config.settings.reduceMotion ? 'reduce-motion' : ''}`}>
    <aside className="sidebar"><div className="brand"><Logo/><div><strong>dock<span>_box</span><sup>✦</sup></strong><small>YOUR DESKTOP, REIMAGINED</small></div></div>
      <div className="workspace-card"><div className="avatar"><span>✧</span></div><div><strong>我的桌面空间</strong><small><i/> {state.preview ? '外观预览模式' : '让灵感，随手可得'}</small></div></div>
      <span className="nav-caption">个性化工作台</span><nav>{navigation.map(n => <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => navigate(n.id)}><n.icon size={19} strokeWidth={1.6}/><span>{n.label}</span>{page === n.id && <span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="tip-card"><Sparkles size={20}/><strong>一点改变，很多喜欢。</strong><p>让每一次打开电脑，<br/>都从好心情开始。</p><button onClick={() => navigate('appearance')}>装扮我的 Dock <ArrowUpRight size={14}/></button></div><button className="sidebar-help" onClick={() => setHelp(true)}><CircleHelp size={17}/>使用小指南<span>↗</span></button><div className="sidebar-version"><span><i/> {state.preview ? 'WEB PREVIEW' : '本地运行 · 无需登录'}</span><span>v{state.version}</span></div></div>
    </aside>
    <div className="main-shell"><div className="titlebar"><div className="breadcrumbs">工作台<ChevronRight size={12}/><span>{current.label}</span></div><div className="titlebar-right"><span className="local-badge"><ShieldCheck size={13}/> 数据保存在本机</span><div className="window-controls"><button aria-label="最小化" onClick={() => void run(() => api.windowAction('minimize'))}><Minus size={16}/></button><button aria-label="关闭控制中心" onClick={() => void run(() => api.windowAction('close'))}><X size={17}/></button></div></div></div>
      <div className="main-scroll"><div className="topline"><span className="date-note">YOUR SPACE. YOUR PACE.</span><div className="global-search"><Search size={16}/><input aria-label="搜索设置" placeholder="寻找你的设置…" value={search} onChange={e => setSearch(e.target.value)}/><kbd>⌕</kbd>{search && <div className="search-results">{matches.length ? matches.map(n => <button key={n.id} onClick={() => navigate(n.id)}><n.icon size={17}/><span>{n.label}<small>{n.keywords}</small></span><ChevronRight size={14}/></button>) : <p>没有找到相关设置，试试「图标」或「任务栏」。</p>}</div>}</div></div>
        <div className="page-content" key={page}>{page === 'home' ? <Home navigate={navigate}/> : page === 'appearance' ? <Appearance/> : page === 'behavior' ? <Behavior/> : page === 'apps' ? <AppsPage/> : page === 'desktop' ? <Desktop/> : <General/>}</div>
        <footer className="main-footer"><span>Made for a calmer desktop.</span><span>dock_box <Heart size={11}/> 个性，由你定义</span></footer>
      </div>
    </div>
    {help && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setHelp(false); }}><section className="modal help-modal" role="dialog" aria-modal="true" aria-label="使用小指南"><button className="modal-close icon-button" aria-label="关闭指南" onClick={() => setHelp(false)}><X size={18}/></button><span className="eyebrow">A QUICK HELLO</span><h2>你的 Dock，开箱即用。</h2><p>把常用应用放到一起，让桌面回归简单。</p><ol><li><strong>加入常用应用</strong><span>拖入桌面快捷方式，或在「应用与分类」中从已安装应用添加。</span></li><li><strong>整理成自己的分类</strong><span>新建分类，把应用移入其中。支持透明堆叠列表、网格、普通列表和扇形展开。</span></li><li><strong>选一款喜欢的外观</strong><span>在「Dock 外观」中调整风格、位置、大小和透明度，即时生效。</span></li><li><strong>随时回到控制中心</strong><span>右键 Dock、双击托盘图标，或按 Ctrl + Shift + D。</span></li></ol><button className="button primary full-width" onClick={() => setHelp(false)}>开始我的桌面之旅 <ArrowUpRight size={16}/></button></section></div>}
  </div>;
}
function SwitchSetting({ setting, title, description, icon, native = false }: { setting: keyof Settings; title: string; description: string; icon?: ReactNode; native?: boolean }) {
  const { state, update } = useStore(); return <SettingRow icon={icon} title={title} description={description}><Toggle label={title} checked={!!state.config.settings[setting]} disabled={native && !state.native.available} onChange={value => update({ [setting]: value })}/></SettingRow>;
}
function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { state, update } = useStore(); return <div className={`theme-grid ${compact ? 'compact' : ''}`}>{themes.map(theme => <button key={theme.id} aria-pressed={state.config.settings.theme === theme.id} className={`theme-option ${state.config.settings.theme === theme.id ? 'selected' : ''}`} onClick={() => update({ theme: theme.id })}><span className="theme-swatch" style={{ background: theme.swatch }}><span className="swatch-dock"><i/><i/><i/><i/><i/></span>{state.config.settings.theme === theme.id && <span className="theme-check"><Check size={11}/></span>}</span><strong>{theme.name}</strong>{!compact && <small>{theme.description}</small>}</button>)}</div>;
}
function Home({ navigate }: { navigate: (page: string) => void }) {
  const { state } = useStore();
  const s = state.config.settings;
  const groups = state.config.items.filter(i => i.kind === 'group').length;
  const apps = state.config.items.reduce((count, item) => count + (item.kind === 'separator' ? 0 : item.kind === 'group' ? item.children?.length || 0 : 1), 0);
  const enhancements = [s.hideDesktopIcons, s.middleClickDesktop, s.screenCorners, s.taskbarStyle !== 'system'].filter(Boolean).length;
  return <><PageHeader eyebrow="HELLO, LOVELY DESKTOP" title="让桌面，轻一点。" description="常用的触手可及，喜欢的刚好在眼前。"><span className="status-pill"><span/>{state.preview ? '界面预览中' : 'Dock 已就绪'}</span></PageHeader>
    <DesktopPreview hero/>
    <div className="stat-grid"><button className="stat-card" onClick={() => navigate('apps')}><span className="stat-icon lavender"><AppWindow size={21}/></span><div><small>常用应用</small><strong>{String(apps).padStart(2, '0')}<em>个应用</em></strong></div><ArrowUpRight size={15}/></button><button className="stat-card" onClick={() => navigate('apps')}><span className="stat-icon peach"><Layers3 size={21}/></span><div><small>我的分类</small><strong>{String(groups).padStart(2, '0')}<em>个集合</em></strong></div><ArrowUpRight size={15}/></button><button className="stat-card" onClick={() => navigate('appearance')}><span className="stat-icon mint"><Palette size={21}/></span><div><small>当前风格</small><strong className="stat-word">{themes.find(t => t.id === s.theme)?.name}<em>自由定义</em></strong></div><ArrowUpRight size={15}/></button><button className="stat-card" onClick={() => navigate('desktop')}><span className="stat-icon blue"><Sparkles size={21}/></span><div><small>桌面美化</small><strong>{String(enhancements).padStart(2, '0')}<em>项已开启</em></strong></div><ArrowUpRight size={15}/></button></div>
    <div className="home-columns"><Card title="换个风格，换种心情" subtitle="给日常，挑一点喜欢的颜色。" action={<LinkButton onClick={() => navigate('appearance')}>全部设置</LinkButton>}><ThemePicker compact/><div className="card-note"><Palette size={13}/><span>每种风格，都可以继续调整成你的样子。</span></div></Card><Card title="常用开关" subtitle="让顺手的事情，更顺手。" action={<SlidersHorizontal size={17} className="muted-icon"/>}><SwitchSetting setting="launchOnStartup" title="开机时陪伴你" description="登录 Windows 后自动启动" icon={<Power size={17}/>}/><SwitchSetting setting="autoHide" title="需要时，再出现" description="鼠标离开后自动隐藏 Dock" icon={<Eye size={17}/>}/><SwitchSetting setting="middleClickDesktop" title="桌面一键清爽" description="中键点击桌面，切换图标显示" icon={<Mouse size={17}/>} native/></Card></div>
    <div className="bottom-banner"><span className="banner-icon"><MousePointer2 size={19}/></span><div><strong>你的效率小捷径</strong><p>拖入应用，随心排列。点击分类，让常用应用有个家。</p></div><button onClick={() => navigate('apps')}>整理我的应用 <ArrowUpRight size={15}/></button></div>
  </>;
}
function Appearance() {
  const { state, update } = useStore(); const s = state.config.settings;
  return <><PageHeader eyebrow="MAKE IT YOURS" title="刚刚好的，才是你的。" description="一点位置，一点色彩。每个细节，实时呈现在桌面。"/><DesktopPreview/>
    <Card title="风格与质感" subtitle="从一款喜欢的风格开始。"><ThemePicker/><div className="control-grid three"><Slider label="背景透明度" value={s.opacity} min={0} max={100} unit="%" onChange={opacity => update({ opacity })}/><Slider label="Dock 圆角" value={s.radius} min={0} max={40} onChange={radius => update({ radius })}/><Slider label="整体缩放" value={s.zoom} min={70} max={140} unit="%" onChange={zoom => update({ zoom })}/></div></Card>
    <Card title="位置与布局" subtitle="找到最顺手的那个角落。"><div className="position-section"><div><span className="field-label">Dock 位置</span><div className="position-picker">{(['top','bottom','left','right'] as const).map((position, index) => <button key={position} aria-pressed={s.position === position} className={s.position === position ? 'selected' : ''} onClick={() => update({ position })}><span className={`position-icon ${position}`}><i/></span>{['顶部','底部','左侧','右侧'][index]}{s.position === position && <Check size={12}/>}</button>)}</div></div><Select label="显示屏幕" value={s.displayId} onChange={displayId => update({ displayId })} options={[{ value: 'primary', label: '跟随主显示器' }, ...state.displays.map(d => ({ value: d.id, label: `${d.name} · ${d.width} × ${d.height}` }))]}/></div><div className="control-grid three"><Slider label="屏幕边距" value={s.edgeMargin} min={0} max={120} onChange={edgeMargin => update({ edgeMargin })}/><Slider label="居中偏移" value={s.offset} min={-600} max={600} step={2} onChange={offset => update({ offset })}/><Slider label="图标间距" value={s.gap} min={0} max={28} onChange={gap => update({ gap })}/></div></Card>
    <Card title="图标与文字" subtitle="清晰，舒服，一眼就能找到。"><div className="control-grid two"><Slider label="图标大小" value={s.iconSize} min={28} max={88} onChange={iconSize => update({ iconSize })}/><Slider label="名称字号" value={s.fontSize} min={10} max={20} onChange={fontSize => update({ fontSize })}/></div><SwitchSetting setting="showLabels" title="显示应用名称" description="鼠标悬停时，在图标旁显示名称" icon={<Type size={18}/>}/><div className="control-grid two"><Select label="名称字体" value={s.fontFamily} options={['Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', 'SimHei', 'SimSun', 'Arial'].map(font => ({ value: font, label: font }))} onChange={fontFamily => update({ fontFamily })}/></div></Card>
  </>;
}
function Behavior() {
  const { state, update } = useStore(); const s = state.config.settings;
  return <><PageHeader eyebrow="A LITTLE MOMENT OF DELIGHT" title="每次靠近，都有回应。" description="柔和的动态，让每一次交互多一点愉悦。"/><DesktopPreview/>
    <Card title="悬停与点击" subtitle="让鼠标经过的地方，灵动起来。"><div className="effect-options">{[{ value: 'wave', title: '波浪放大', desc: '相邻图标平滑跟随', icon: Volume2 }, { value: 'lift', title: '轻盈浮起', desc: '当前图标单独放大', icon: ArrowUpRight }, { value: 'none', title: '安静停留', desc: '保持原始图标大小', icon: MousePointer2 }].map(effect => <button key={effect.value} className={s.hoverEffect === effect.value ? 'selected' : ''} onClick={() => update({ hoverEffect: effect.value as Settings['hoverEffect'] })}><effect.icon size={23}/><strong>{effect.title}</strong><small>{effect.desc}</small>{s.hoverEffect === effect.value && <CheckCircle2 size={15} className="effect-check"/>}</button>)}</div><div className="control-grid two"><Slider label="图标放大倍率" value={s.magnification} min={1} max={2.4} step={.05} unit="×" onChange={magnification => update({ magnification })}/><Slider label="放大影响范围" value={s.magnifyRange} min={1} max={4} step={.1} unit="个图标" onChange={magnifyRange => update({ magnifyRange })}/></div><div className="control-grid two"><Select label="点击反馈" value={s.clickEffect} onChange={clickEffect => update({ clickEffect: clickEffect as Settings['clickEffect'] })} options={[{ value: 'bounce', label: '轻轻弹跳' }, { value: 'pulse', label: '柔和脉冲' }, { value: 'none', label: '无动画' }]}/><Select label="分类展开方式" value={s.groupLayout} onChange={groupLayout => update({ groupLayout: groupLayout as Settings['groupLayout'] })} options={[{ value: 'grid', label: '网格 · 一目了然' }, { value: 'list', label: '列表 · 有序展开' }, { value: 'stack', label: '透明堆叠列表 · 图标在右侧' }, { value: 'fan', label: '扇形 · 灵动堆叠' }]}/></div></Card>
    <Card title="出现的时机" subtitle="专注的时候，把空间还给你。"><SwitchSetting setting="autoHide" title="自动隐藏 Dock" description="移开鼠标后隐藏，触碰所选工作区边缘即可呼出" icon={<Eye size={18}/>}/><div className="control-grid two"><Slider label="隐藏延迟" value={s.hideDelay} min={100} max={3000} step={50} unit="ms" onChange={hideDelay => update({ hideDelay })}/></div><SwitchSetting setting="alwaysOnTop" title="保持 Dock 置顶" description="Dock 显示在普通应用窗口上方" icon={<Layers3 size={18}/>}/><SwitchSetting setting="reduceMotion" title="减少动态效果" description="关闭缩放、弹跳和过渡，让画面更安静" icon={<MousePointer2 size={18}/>}/></Card>
  </>;
}
export function IconSettings() {
  const { state, update } = useStore(); const s = state.config.settings;
  return <Card title="图标与名称" subtitle="调整图标大小、名称与显示方式。">
    <div className="control-grid two"><Slider label="图标大小" value={s.iconSize} min={28} max={88} onChange={iconSize => update({ iconSize })}/><Slider label="名称字号" value={s.fontSize} min={10} max={20} onChange={fontSize => update({ fontSize })}/></div>
    <SwitchSetting setting="showLabels" title="显示 Dock 图标名称" description="关闭后隐藏图标的悬停名称" icon={<Type size={18}/>}/>
    <SwitchSetting setting="iconReflection" title="图标倒影" description="在 Dock 图标靠近停靠边缘的一侧显示渐变倒影" icon={<Layers3 size={18}/>}/>
    <div className="control-grid two"><Select label="字体样式" value={s.fontFamily} options={['Microsoft YaHei UI','Microsoft YaHei','Segoe UI','SimHei','SimSun','Arial'].map(font => ({ value: font, label: font }))} onChange={fontFamily => update({ fontFamily })}/></div>
  </Card>;
}
function Desktop() {
  const { state, update, run, setState } = useStore(); const s = state.config.settings;
  return <><PageHeader eyebrow="BEYOND THE DOCK" title="清爽，不止于 Dock。" description="把整个桌面，都调成你喜欢的样子。"><button className="button" onClick={() => void run(async () => setState(await api.restoreDesktop()), '已关闭桌面美化效果')}><RotateCcw size={15}/>关闭美化</button></PageHeader>
    <div className={`service-banner ${state.native.available ? '' : 'warning'}`}><ShieldCheck size={23}/><div><strong>{state.native.available ? 'Windows 桌面服务已连接' : state.preview ? '当前为浏览器预览' : 'Windows 桌面服务未连接'}</strong><p>{state.native.message}{state.native.available ? ' · 退出 dock_box 时自动释放美化效果。' : ''}</p></div><span className="status-pill"><span/>{state.native.available ? '已就绪' : '预览'}</span></div>
    <Card title="桌面图标" subtitle="需要的时候，才让它们出现。"><SwitchSetting setting="hideDesktopIcons" title="隐藏桌面软件图标" description="只切换图标可见性，不会删除桌面文件" icon={<AppWindow size={20}/>} native/><SwitchSetting setting="middleClickDesktop" title="中键切换桌面图标" description="在桌面空白处或桌面图标上点击鼠标中键，切换显示与隐藏" icon={<Mouse size={20}/>} native/></Card>
    <Card title="任务栏质感" subtitle="让 Windows 任务栏融入你的桌面。"><fieldset disabled={!state.native.available}><div className="taskbar-demo" style={{ '--bar-color': s.taskbarColor, '--bar-opacity': s.taskbarOpacity / 100 } as React.CSSProperties}><div className="mini-wallpaper"/><div className={`mini-taskbar style-${s.taskbarStyle}`}><Logo small/><i/><i/><i/><div/><span>09:41</span></div><span className="demo-caption">效果示意</span></div><div className="control-grid two"><Select label="任务栏风格" value={s.taskbarStyle} onChange={taskbarStyle => update({ taskbarStyle: taskbarStyle as Settings['taskbarStyle'] })} options={[{ value: 'system', label: '跟随系统' }, { value: 'transparent', label: '完全透明' }, { value: 'blur', label: '磨砂模糊' }, { value: 'color', label: '自定义颜色' }]}/><div className="color-control"><label htmlFor="taskbar-color">自定义任务栏颜色</label><div><input id="taskbar-color" aria-label="任务栏颜色" type="color" value={s.taskbarColor} onChange={e => update({ taskbarColor: e.target.value })}/><code>{s.taskbarColor.toUpperCase()}</code></div></div></div><div className="control-grid two"><Slider label="任务栏颜色不透明度" value={s.taskbarOpacity} min={0} max={100} unit="%" onChange={taskbarOpacity => update({ taskbarOpacity })}/></div></fieldset><p className="compatibility-note"><CircleHelp size={14}/>系统版本会影响任务栏效果。样式切换会即时应用；选择“跟随系统”或退出时恢复任务栏。</p>{!state.native.taskbarSupported && state.native.available && <p className="inline-warning">Windows 任务栏接口暂未响应，请刷新 Dock 后重试。</p>}</Card>
    <Card title="屏幕圆角" subtitle="给桌面边缘，一点柔和的弧度。"><SwitchSetting setting="screenCorners" title="开启屏幕圆角美化" description="在所有显示器的四角添加可穿透点击的黑色圆角遮罩" icon={<CornerUpLeft size={20}/>} native/><fieldset disabled={!state.native.available}><div className="control-grid two"><Slider label="屏幕圆角半径" value={s.cornerRadius} min={6} max={60} onChange={cornerRadius => update({ cornerRadius })}/></div></fieldset></Card>
  </>;
}
function General() {
  const { state, run, setState, toast, update } = useStore();
  return <><PageHeader eyebrow="THE LITTLE DETAILS" title="简单的设置，长久的顺手。" description="你的习惯和偏好，都会被好好记住。"/>
    <Card title="启动与常驻" subtitle="以你习惯的方式，开始每一天。"><SwitchSetting setting="launchOnStartup" title="开机自动启动" description="登录 Windows 时自动运行并显示 Dock" icon={<Rocket size={20}/>}/><SwitchSetting setting="startupAnimation" title="开机启动动画" description="开机自启时显示 Dock 入场动画与就绪提示；减少动态效果时自动关闭" icon={<Sparkles size={20}/>}/><SwitchSetting setting="showTray" title="显示系统托盘图标" description="双击托盘图标打开设置，右键可退出应用" icon={<Bell size={20}/>}/><SettingRow icon={<Keyboard size={20}/>} title="打开控制中心" description="隐藏托盘后，也能通过快捷键或 Dock 右键菜单打开"><span className="shortcut"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>D</kbd></span></SettingRow></Card>
    <Card title="管理面板" subtitle="设备、启动方式与网络权限。">
      <SwitchSetting setting="detectUsb" title="U 盘检测" description="自动检测可移动磁盘，插入后在 Dock 显示入口，拔出后移除" icon={<Monitor size={20}/>} native/>
      {state.config.settings.detectUsb && <p className="device-status">{state.usbDrives?.length ? state.usbDrives.map(drive => `${drive.name}${drive.ready ? '' : ' · 未就绪'}`).join('、') : '等待插入 U 盘'}</p>}
      <SwitchSetting setting="systemLaunch" title="启用系统接口启动图标" description="使用 Windows Shell 启动应用、快捷方式和网址，支持启动参数与工作目录" icon={<AppWindow size={20}/>}/>
      <SwitchSetting setting="blockNetwork" title="禁止 dock_box 联网" description="通过 Windows 防火墙阻止本程序所有入站与出站连接；切换需要管理员授权，通过 Dock 打开的浏览器保持独立权限" icon={<ShieldCheck size={20}/>} native/>
      {state.networkStatus && <p className="device-status" role="status">{state.networkStatus}</p>}
      <div className="color-control"><label htmlFor="trigger-color">触发条颜色（自动隐藏时显示）</label><div><input id="trigger-color" aria-label="触发条颜色" type="color" value={state.config.settings.triggerColor} onChange={e => update({ triggerColor: e.target.value })}/><code>{state.config.settings.triggerColor.toUpperCase()}</code></div></div>
    </Card>
    <IconSettings/>
    <Card title="配置与数据" subtitle="把喜欢的桌面带走，也随时重新开始。"><SettingRow icon={<Download size={20}/>} title="导出我的配置" description="保存外观、分类、应用路径与自定义图标到 JSON"><button className="button small-button" onClick={() => void run(async () => { if (await api.exportConfig()) toast('配置已导出'); })}>导出配置<ArrowUpRight size={14}/></button></SettingRow><SettingRow icon={<Upload size={20}/>} title="导入已有配置" description="恢复布局和应用列表，保留本机的系统美化开关"><button className="button small-button" onClick={() => void run(async () => { const next = await api.importConfig(); if (next) { setState(next); toast('配置已导入'); } })}>选择文件<ArrowUpRight size={14}/></button></SettingRow><SettingRow icon={<RotateCcw size={20}/>} title="恢复默认设置" description="恢复初始外观和应用列表，建议先导出备份"><button className="button small-button subtle-danger" onClick={() => void run(async () => { const next = await api.resetConfig(); if (next) { setState(next); toast('已恢复默认设置'); } })}>恢复默认</button></SettingRow></Card>
    <Card className="about-card"><Logo/><div><span className="eyebrow">A SMALL DOCK. A BETTER EVERYDAY.</span><h2>dock_box <span>v{state.version}</span></h2><p>为 Windows 打造的轻盈桌面 Dock。<br/>开源、本地运行，让你的桌面更像你。</p><button className="button" onClick={() => void run(() => api.openRepo())}><Github size={16}/>在 GitHub 上查看<ArrowUpRight size={14}/></button></div></Card>
    <div className="quit-row"><p>退出后会恢复本次运行前的桌面图标和任务栏状态。</p><button className="text-button danger" onClick={() => void run(() => api.windowAction('quit'))}><Power size={15}/>退出 dock_box</button></div>
  </>;
}
