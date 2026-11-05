import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Btn } from './ui';

export const Logo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="7" fill="var(--panel-2)" stroke="var(--line)" />
    <path d="M7 21l5-10 4 7 3-5 6 9" fill="none" stroke="var(--fiber)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Navigation. `key` = Alt+key shortcut. */
export const NAV = [
  { group: 'Daily work' },
  { to: '/', label: 'Dashboard', key: '1', end: true },
  { to: '/pos', label: 'Point of sale', perm: 'pos', key: '2' },
  { to: '/sales', label: 'Sales & returns', perm: 'pos', key: '3' },
  { to: '/pc-builder', label: 'PC builder & quotes', perm: 'pos' },
  { to: '/customers', label: 'Customers & dues', key: '4' },
  { to: '/expenses', label: 'Daily expenses', perm: 'expenses' },
  { group: 'Stock' },
  { to: '/stock', label: 'Products & stock', key: '5' },
  { to: '/purchases', label: 'Purchases', perm: 'purchase', key: '6' },
  { to: '/suppliers', label: 'Suppliers', perm: 'suppliers' },
  { to: '/warranty', label: 'Warranty claims', perm: 'warranty', key: '7' },
  { to: '/history', label: 'Item history explorer', key: '8' },
  { group: 'Money & reports' },
  { to: '/accounts', label: 'Cash, bank & MFS', perm: 'accounts' },
  { to: '/reports', label: 'Reports hub', perm: 'reports', key: '9' },
  { group: 'Admin' },
  { to: '/users', label: 'Users & roles', perm: 'users' },
  { to: '/settings', label: 'Settings' }
];

export default function Layout() {
  const { user, settings, theme, toggleTheme, logout, can } = useStore();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);

  useEffect(() => {
    const h = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const item = NAV.find((n) => n.key === e.key && (!n.perm || can(n.perm)));
      if (item) { e.preventDefault(); nav(item.to); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nav, can]);

  const items = NAV.filter((n) => n.group || !n.perm || can(n.perm));
  // drop empty groups
  const visible = items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`} onClick={(e) => open && e.target === e.currentTarget && setOpen(false)}>
      <aside className="rail">
        <div className="brand"><Logo /><div>{settings.shop_name || 'ShopERP'}<small>Shop management & POS</small></div></div>
        <nav className="nav">
          {visible.map((n, i) => n.group
            ? <div className="nav-group" key={'g' + i}>{n.group}</div>
            : <NavLink key={n.to} to={n.to} end={n.end}>{n.label}{n.key && <kbd>Alt {n.key}</kbd>}</NavLink>)}
        </nav>
        <div className="rail-foot">
          <div className="who"><b>{user?.name}</b><span className="muted">{user?.role === 'sales' ? 'Sales staff' : user?.role === 'manager' ? 'Manager' : 'Admin'}</span></div>
          <Btn size="sm" onClick={toggleTheme} title="Switch light / dark mode">{theme === 'dark' ? 'Light' : 'Dark'}</Btn>
          <Btn size="sm" onClick={logout}>Sign out</Btn>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
          <span>{settings.shop_name || 'ShopERP'}</span>
        </div>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
