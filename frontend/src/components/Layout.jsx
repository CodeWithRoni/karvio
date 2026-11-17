import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Btn, Loading } from './ui';
import { isOffline, endpoint } from '../lib/api';
import { saveBrand } from '../lib/brand';
import NavIcon from './NavIcon';

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
// Long shop names shrink a little so the whole name fits on one line.
const nameSize = (n) => (n.length > 22 ? 12 : n.length > 17 ? 13 : 15);
const NAV_KEY = 'karvio_nav_hidden';
const readHidden = () => { try { return localStorage.getItem(NAV_KEY) === '1'; } catch { return false; } };
const CLOSED_KEY = 'karvio_nav_closed';
const readClosed = () => { try { const v = JSON.parse(localStorage.getItem(CLOSED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const Chevron = () => <svg className="nav-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

/** Navigation. `key` = Alt+key shortcut. */
export const NAV = [
  { group: 'Search' },
  { to: '/history', label: 'Advanced search', key: '8' },
  { group: 'Daily Work' },
  { to: '/', label: 'Dashboard', key: '1', end: true },
  { to: '/pos', label: 'Point of sale', perm: 'pos', key: '2' },
  { to: '/sales', label: 'Sales & returns', perm: 'pos', key: '3' },
  { to: '/pc-builder', label: 'Quotation', perm: 'pos' },
  { to: '/customers', label: 'Customers', key: '4' },
  { to: '/collection', label: 'Collection', perm: 'customers' },
  { to: '/payment', label: 'Payment', perm: 'suppliers' },
  { to: '/repairs', label: 'Repairs', perm: 'repairs' },
  { to: '/service', label: 'Service', perm: 'service' },
  { group: 'Stock' },
  { to: '/stock', label: 'Products & stock', key: '5' },
  { to: '/barcodes', label: 'Barcode labels' },
  { to: '/prices', label: 'Price manager', perm: 'products' },
  { to: '/purchases', label: 'Purchases & returns', perm: 'purchase', key: '6' },
  { to: '/suppliers', label: 'Suppliers', perm: 'suppliers' },
  { to: '/warranty', label: 'Warranty claims', perm: 'warranty', key: '7' },
  { group: 'Party Ledger Adjust' },
  { to: '/customer-ledger-adjustment', label: 'Customer Ledger Adjust', perm: '*' }, // '*' = admin only
  { to: '/supplier-ledger-adjustment', label: 'Supplier Ledger Adjust', perm: '*' },
  { to: '/customer-ledger-report', label: 'Customer Ledger Report', perm: '*' },
  { to: '/supplier-ledger-report', label: 'Supplier Ledger Report', perm: '*' },
  { group: 'Money & Reports' },
  { to: '/accounts', label: 'Cash, bank & MFS', perm: 'accounts' },
  { to: '/profit', label: 'Profit', perm: ['reports', 'cost'] },
  { to: '/expenses', label: 'Expenses', perm: 'expenses' },
  { to: '/reports', label: 'Reports hub', perm: 'reports', key: '9' },
  { group: 'Admin' },
  { to: '/users', label: 'Users & roles', perm: 'users' },
  { to: '/activity', label: 'Activity log', perm: 'users' },
  { to: '/settings', label: 'Settings' }
];

export default function Layout() {
  const { user, settings, theme, toggleTheme, logout, can } = useStore();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(readHidden); // desktop: menu tucked away
  const [closed, setClosed] = useState(readClosed); // menu groups folded away by this user on this browser
  const [showKeys, setShowKeys] = useState(false); // Alt held: every shortcut shows
  const toggleGroup = (title) => setClosed((c) => { const next = c.includes(title) ? c.filter((x) => x !== title) : [...c, title]; try { localStorage.setItem(CLOSED_KEY, JSON.stringify(next)); } catch { /* private mode */ } return next; });
  const toggleHidden = () => setHidden((h) => { try { localStorage.setItem(NAV_KEY, h ? '0' : '1'); } catch { /* private mode */ } return !h; });
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  // Browser tab title: the open page's menu name, in capitals (e.g. "BARCODE LABELS").
  useEffect(() => {
    const p = loc.pathname;
    const page = NAV.find((n) => n.to && (n.end ? p === n.to : p === n.to || p.startsWith(n.to + '/')));
    document.title = (page ? page.label : 'Karvio').toUpperCase();
  }, [loc.pathname]);
  useEffect(() => () => { document.title = 'Karvio'; }, []);
  useEffect(() => { if (!isOffline()) saveBrand(endpoint(), settings); }, [settings]);
  // Phone menu: Esc closes it, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    document.body.classList.add('nav-lock');
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('nav-lock'); };
  }, [open]);

  useEffect(() => {
    const h = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const item = NAV.find((n) => n.key === e.key && (!n.perm || can(n.perm)));
      if (item) { e.preventDefault(); nav(item.to); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nav, can]);
  useEffect(() => {
    const down = (e) => { if (e.key === 'Alt') setShowKeys(true); };
    const up = (e) => { if (e.key === 'Alt') setShowKeys(false); };
    const off = () => setShowKeys(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', off); };
  }, []);

  const items = NAV.filter((n) => n.group || !n.perm || can(n.perm));
  // drop empty groups, then bundle each group with its links so every group is its own card
  const visible = items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));
  const groups = [];
  visible.forEach((n) => { if (n.group) groups.push({ title: n.group, links: [] }); else if (groups.length) groups[groups.length - 1].links.push(n); });
  const tone = { Search: 'g-search', 'Daily Work': 'g-daily', Stock: 'g-stock', 'Party Ledger Adjust': 'g-adjust', 'Money & Reports': 'g-money', Admin: 'g-admin' };

  return (
    <div className={`shell ${open ? 'nav-open' : ''} ${hidden ? 'nav-hidden' : ''} ${showKeys ? 'show-keys' : ''}`} onClick={(e) => open && e.target === e.currentTarget && setOpen(false)}>
      <aside className="rail" aria-hidden={hidden ? 'true' : undefined}>
        <div className="brand">
          <div className="brand-top">
            {/^data:image\//.test(settings.shop_logo || '') ? <img className="brand-logo" src={settings.shop_logo} alt="" /> : <Logo size={24} />}
            <b className="brand-name" title={settings.shop_name || 'Karvio'} style={{ fontSize: nameSize(settings.shop_name || 'Karvio') }}>{settings.shop_name || 'Karvio'}</b>
            <button type="button" className="door-btn" onClick={() => (open ? setOpen(false) : toggleHidden())} title="Hide the menu" aria-label="Hide the menu"><DoorIcon open size={16} /></button>
          </div>
          <small className="brand-sub">{isOffline() ? 'Offline · saved on this PC' : 'Karvio · Shop management & POS'}</small>
        </div>
        <nav className="nav">
          {groups.map((g) => {
            // The group holding the open page never folds away.
            const here = g.links.some((n) => (n.end ? loc.pathname === n.to : loc.pathname === n.to || loc.pathname.startsWith(n.to + '/')));
            const shut = closed.includes(g.title) && !here;
            return (
              <section className={`nav-card ${tone[g.title] || ''} ${shut ? 'closed' : ''}`} key={g.title}>
                <button type="button" className="nav-group" aria-expanded={!shut} aria-label={`${g.title} menu group`} onClick={() => toggleGroup(g.title)} title={shut ? `Show ${g.title}` : `Fold ${g.title}`}>
                  <NavIcon name={g.title} group /><span className="nav-group-label">{g.title}</span>{shut && <span className="nav-count">{g.links.length}</span>}<Chevron />
                </button>
                {!shut && g.links.map((n) => <NavLink key={n.to} to={n.to} end={n.end} title={n.key ? `${n.label} (Alt+${n.key})` : n.label}><NavIcon name={n.to} /><span className="nav-item-label">{n.label}</span>{n.key && <kbd>Alt {n.key}</kbd>}</NavLink>)}
              </section>
            );
          })}
        </nav>
        <div className="rail-foot">
          <div className="who"><b>{user?.name}</b><span className="muted">{{ sales: 'Sales staff', manager: 'Manager', technician: 'Technician', admin: 'Admin' }[user?.role] || user?.role || 'Staff'}</span></div>
          <Btn size="sm" onClick={toggleTheme} title="Switch light / dark mode">{theme === 'dark' ? 'Light' : 'Dark'}</Btn>
          <Btn size="sm" onClick={logout}>Sign out</Btn>
        </div>
      </aside>
      <div className="main">
        {hidden && <button type="button" className="door-btn door-float" onClick={toggleHidden} title="Show the menu" aria-label="Show the menu"><DoorIcon open={false} size={16} /></button>}
        <div className="topbar">
          <button onClick={() => setOpen(true)} aria-label="Open menu"><DoorIcon open={false} size={18} /></button>
          <span>{settings.shop_name || 'Karvio'}</span>
        </div>
        {/* A page whose file is still loading shows its placeholder here only: the menu never leaves the screen. */}
        <main className="content"><Suspense fallback={<Loading />}><Outlet /></Suspense></main>
      </div>
    </div>
  );
}
