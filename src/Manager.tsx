import { useEffect, useState } from 'react';
import { Minus, X } from 'lucide-react';
import { AppsPage } from './apps';
import { IconSettings } from './SettingsApp';
import { api } from './api';
import { useStore } from './store';

export default function Manager() {
  const { state, run } = useStore();
  const [route, setRoute] = useState(location.hash.slice('/manage/'.length + 1));
  useEffect(() => api.onPage(setRoute), []);
  const [page, id] = route.split('/');
  const title = page === 'icons' ? '图标设置' : page === 'groups' ? '分类管理' : '添加应用';
  return <div className={`settings-app dedicated-manager ${state.config.settings.reduceMotion ? 'reduce-motion' : ''}`}>
    <div className="main-shell"><div className="titlebar"><strong>{title}</strong><div className="window-controls"><button aria-label="最小化" onClick={() => void run(() => api.windowAction('minimize'))}><Minus size={16}/></button><button aria-label="关闭管理窗口" onClick={() => void run(() => api.windowAction('close'))}><X size={17}/></button></div></div>
      <div className="main-scroll" key={route}>{page === 'icons' && !id ? <IconSettings/> : <AppsPage groupId={page === 'groups' ? id : undefined} editId={page === 'icons' ? id : undefined} autoScan={page === 'apps'}/>}</div>
    </div>
  </div>;
}
