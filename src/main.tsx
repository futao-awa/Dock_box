import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './store';
import { DockWindow, GroupWindow } from './Dock';
import './styles.css';

const hash = location.hash.slice(1);
const transparent = hash.startsWith('/group/') || hash.startsWith('/dock');
// Set both canvas backgrounds before the first render, including loading and error states.
if (transparent) { document.documentElement.classList.add('transparent-window'); document.body.classList.add('transparent-window'); }
const SettingsApp = lazy(() => import('./SettingsApp').then(module => ({ default: module.SettingsApp })));
const Manager = lazy(() => import('./Manager'));
function Routes() {
  const [route, setRoute] = useState(location.hash.slice(1));
  useEffect(() => { const update = () => setRoute(location.hash.slice(1)); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  return route.startsWith('/group/') ? <GroupWindow key={route} id={decodeURIComponent(route.slice(7))}/> : route.startsWith('/dock') ? <DockWindow/> : route.startsWith('/manage/') ? <Manager/> : <SettingsApp/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppProvider><Suspense fallback={null}><Routes/></Suspense></AppProvider></React.StrictMode>);
