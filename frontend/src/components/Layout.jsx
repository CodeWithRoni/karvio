import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Btn } from './ui';

// Karvio app mark (files in public/, so they work on GitHub Pages, desktop and mobile builds).
export const Logo = ({ size = 28 }) => (
  <img src={`${import.meta.env.BASE_URL}karvio-mark.png`} width={size} height={size} alt="" aria-hidden="true" style={{ borderRadius: size * 0.22, flex: 'none' }} />
);

/** Door icon for showing / hiding the side menu: an open door while the menu is out, a closed one while it is hidden. */
export const DoorIcon = ({ open = true, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21h18" />
    <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" />
    {open
      ? <><path d="M5 3l8 2.5V21L5 21" fill="currentColor" fillOpacity=".18" /><circle cx="10.5" cy="13" r=".9" fill="currentColor" stroke="none" /></>
      : <circle cx="15.5" cy="12.5" r="1" fill="currentColor" stroke="none" />}
  </svg>
);
const NAV_KEY = 'karvio_nav_hidden';
const readHidden = () => { try { return localStorage.getItem(NAV_KEY) === '1'; } catch { return false; } };

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
  const [hidden, setHidden] = useState(readHidden); // desktop: menu tucked away
  const toggleHidden = () => setHidden((h) => { try { localStorage.setItem(NAV_KEY, h ? '0' : '1'); } catch { /* private mode */ } return !h; });
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
  // drop empty groups, then bundle each group with its links so every group is its own card
  const visible = items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));
  const groups = [];
  visible.forEach((n) => { if (n.group) groups.push({ title: n.group, links: [] }); else if (groups.length) groups[groups.length - 1].links.push(n); });
  const tone = { 'Daily Work': 'g-daily', Stock: 'g-stock', 'Money & Reports': 'g-money', Admin: 'g-admin' };

  return (
    <div className={`shell ${open ? 'nav-open' : ''} ${hidden ? 'nav-hidden' : ''}`} onClick={(e) => open && e.target === e.currentTarget && setOpen(false)}>
      <aside className="rail" aria-hidden={hidden ? 'true' : undefined}>
        <div className="brand"><Logo /><div className="brand-name">{settings.shop_name || 'Karvio'}<small>Karvio · Shop management & POS</small></div>
          <button type="button" className="door-btn" onClick={() => (open ? setOpen(false) : toggleHidden())} title="Hide the menu" aria-label="Hide the menu"><DoorIcon open /></button>
        </div>
        <nav className="nav">
          {groups.map((g) => (
            <section className={`nav-card ${tone[g.title] || ''}`} key={g.title}>
              <div className="nav-group"><i />{g.title}</div>
              {g.links.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}{n.key && <kbd>Alt {n.key}</kbd>}</NavLink>)}
            </section>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="who"><b>{user?.name}</b><span className="muted">{user?.role === 'sales' ? 'Sales staff' : user?.role === 'manager' ? 'Manager' : 'Admin'}</span></div>
          <Btn size="sm" onClick={toggleTheme} title="Switch light / dark mode">{theme === 'dark' ? 'Light' : 'Dark'}</Btn>
          <Btn size="sm" onClick={logout}>Sign out</Btn>
        </div>
      </aside>
      <div className="main">
        {hidden && <button type="button" className="door-btn door-float" onClick={toggleHidden} title="Show the menu" aria-label="Show the menu"><DoorIcon open={false} /></button>}
        <div className="topbar">
          <button onClick={() => setOpen(true)} aria-label="Open menu"><DoorIcon open={false} /></button>
          <span>{settings.shop_name || 'Karvio'}</span>
        </div>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
