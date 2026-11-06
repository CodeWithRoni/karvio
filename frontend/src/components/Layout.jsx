import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Btn } from './ui';

// Karvio app mark (files in public/, so they work on GitHub Pages, desktop and mobile builds).
export const Logo = ({ size = 28 }) => (
  <img src={`${import.meta.env.BASE_URL}karvio-mark.png`} width={size} height={size} alt="" aria-hidden="true" style={{ borderRadius: size * 0.22, flex: 'none' }} />
);

/** Navigation. `key` = Alt+key shortcut. */
export const NAV = [
  { group: 'Daily Work' },
  { to: '/', label: 'Dashboard', key: '1', end: true },
  { to: '/pos', label: 'Point Of Sale', perm: 'pos', key: '2' },
  { to: '/sales', label: 'Sales & Returns', perm: 'pos', key: '3' },
  { to: '/pc-builder', label: 'PC Builder & Quotes', perm: 'pos' },
  { to: '/customers', label: 'Customers & Dues', key: '4' },
  { group: 'Stock' },
  { to: '/stock', label: 'Products & Stock', key: '5' },
  { to: '/prices', label: 'Price Manager', perm: 'products' },
  { to: '/purchases', label: 'Purchases', perm: 'purchase', key: '6' },
  { to: '/suppliers', label: 'Suppliers', perm: 'suppliers' },
  { to: '/warranty', label: 'Warranty Claims', perm: 'warranty', key: '7' },
  { to: '/history', label: 'Advance Search', key: '8' },
  { group: 'Money & Reports' },
  { to: '/accounts', label: 'Cash, Bank & MFS', perm: 'accounts' },
  { to: '/expenses', label: 'Expenses', perm: 'expenses' },
  { to: '/reports', label: 'Reports Hub', perm: 'reports', key: '9' },
  { group: 'Admin' },
  { to: '/users', label: 'Users & Roles', perm: 'users' },
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
        <div className="brand"><Logo /><div>{settings.shop_name || 'Karvio'}<small>Karvio · Shop management & POS</small></div></div>
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
          <span>{settings.shop_name || 'Karvio'}</span>
        </div>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
