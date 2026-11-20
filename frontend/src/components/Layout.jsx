import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Btn, Loading } from './ui';
import { isOffline, endpoint } from '../lib/api';
import { saveBrand } from '../lib/brand';
import NavIcon from './NavIcon';
import { cap1 } from '../lib/format';

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
// Remembered per browser; with no choice saved yet, tablets (narrower than 1024px) start with the slim icon menu.
const readHidden = () => { try { const v = localStorage.getItem(NAV_KEY); if (v === '1' || v === '0') return v === '1'; } catch { /* private mode */ } return typeof window !== 'undefined' && window.innerWidth > 640 && window.innerWidth < 1024; };
const CLOSED_KEY = 'karvio_nav_closed';
const readClosed = () => { try { const v = JSON.parse(localStorage.getItem(CLOSED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const Chevron = () => <svg className="nav-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

/** Navigation. `key` = Alt+key shortcut. */
export const NAV = [
  { group: 'Home' },
  { to: '/', label: 'Dashboard', key: '1', end: true },
  { to: '/history', label: 'Advanced Search', key: '8' },
  { group: 'Sales' },
  { to: '/pos', label: 'Point Of Sale', perm: 'pos', key: '2' },
  { to: '/sales', label: 'Sales & Returns', perm: 'pos', key: '3' },
  { to: '/online-orders', label: 'Online Orders', perm: 'pos' },
  { to: '/pc-builder', label: 'Quotation', perm: 'pos' },
  { to: '/customers', label: 'Customers', key: '4' },
  { to: '/collection', label: 'Collection', perm: 'customers' },
  { group: 'Purchase' },
  { to: '/purchases', label: 'Purchases & Returns', perm: 'purchase', key: '6' },
  { to: '/suppliers', label: 'Suppliers', perm: 'suppliers' },
  { to: '/payment', label: 'Payment', perm: 'suppliers' },
  { group: 'Stock' },
  { to: '/stock', label: 'Products & Stock', key: '5' },
  { to: '/prices', label: 'Price Manager', perm: 'products' },
  { to: '/barcodes', label: 'Barcode Labels' },
  { to: '/stock-count', label: 'Stock Count', perm: 'products' },
  { to: '/branch-transfer', label: 'Branch Transfer', perm: 'products', branches: true },
  { group: 'Service & Warranty' },
  { to: '/repairs', label: 'Repairs', perm: 'repairs' },
  { to: '/service', label: 'Service', perm: 'service' },
  { to: '/warranty', label: 'Warranty Claims', perm: 'warranty', key: '7' },
  { group: 'Party Ledger' },
  { to: '/customer-ledger-report', label: 'Customer Ledger Report', perm: '*' }, // '*' = admin only
  { to: '/supplier-ledger-report', label: 'Supplier Ledger Report', perm: '*' },
  { to: '/customer-ledger-adjustment', label: 'Customer Ledger Adjust', perm: '*' },
  { to: '/supplier-ledger-adjustment', label: 'Supplier Ledger Adjust', perm: '*' },
  { group: 'Money & Reports' },
  { to: '/accounts', label: 'Cash, Bank & MFS', perm: 'accounts' },
  { to: '/shifts', label: 'Shift & Day Close', perm: { any: ['pos', 'accounts'] } },
  { to: '/daybook', label: 'Day Book', perm: 'accounts' },
  { to: '/branch-report', label: 'Branch Report', perm: 'reports', branches: true },
  { to: '/expenses', label: 'Expenses', perm: 'expenses' },
  { to: '/profit', label: 'Profit', perm: ['reports', 'cost'] },
  { to: '/reports', label: 'Reports Hub', perm: 'reports', key: '9' },
  { group: 'Admin' },
  { to: '/users', label: 'Users & Roles', perm: 'users' },
  { to: '/activity', label: 'Activity Log', perm: 'users' },
  { to: '/settings', label: 'Settings' }
];

export default function Layout() {
  const { user, settings, theme, toggleTheme, logout, can } = useStore();
  const branchKey = useStore((s) => s.branchEpoch || 0); // switching the working branch remounts the page, so it loads that branch's data at once
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(readHidden); // desktop: menu tucked away
  const [closed, setClosed] = useState(readClosed); // menu groups folded away by this user on this browser
  const [showKeys, setShowKeys] = useState(false); // Alt held: every shortcut shows
  const toggleGroup = (title) => setClosed((c) => { const next = c.includes(title) ? c.filter((x) => x !== title) : [...c, title]; try { localStorage.setItem(CLOSED_KEY, JSON.stringify(next)); } catch { /* private mode */ } return next; });
  const [tip, setTip] = useState(null);
  const showTip = (e, text) => { if (!hidden) return; const r = e.currentTarget.getBoundingClientRect(); setTip({ text, top: r.top + r.height / 2, left: r.right + 14 }); };
  const hideTip = () => setTip(null);
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

  const branchesOn = useStore((s) => !!s.branches?.on);
  const items = NAV.filter((n) => (n.group || !n.perm || can(n.perm)) && (!n.branches || branchesOn));
  // drop empty groups, then bundle each group with its links so every group is its own card
  const visible = items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));
  const groups = [];
  visible.forEach((n) => { if (n.group) groups.push({ title: n.group, links: [] }); else if (groups.length) groups[groups.length - 1].links.push(n); });
  const tone = { Home: 'g-search', Sales: 'g-daily', Purchase: 'g-purchase', Stock: 'g-stock', 'Service & Warranty': 'g-service', 'Party Ledger': 'g-adjust', 'Money & Reports': 'g-money', Admin: 'g-admin' };

  return (
    <div className={`shell ${open ? 'nav-open' : ''} ${hidden ? 'nav-hidden' : ''} ${showKeys ? 'show-keys' : ''}`} onClick={(e) => open && e.target === e.currentTarget && setOpen(false)}>
      <aside className="rail">
        <div className="brand">
          <div className="brand-top">
            {/^data:image\//.test(settings.shop_logo || '') ? <img className="brand-logo" src={settings.shop_logo} alt="" /> : <Logo size={24} />}
            <b className="brand-name" title={settings.shop_name || 'Karvio'} style={{ fontSize: nameSize(settings.shop_name || 'Karvio') }}>{settings.shop_name || 'Karvio'}</b>
            <button type="button" className="round-toggle door-mobile" onClick={() => setOpen(false)} title="Close the menu" aria-label="Close the menu"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg></button>
          </div>
          <small className="brand-sub">{isOffline() ? 'Offline · saved on this PC' : 'Karvio · Shop management & POS'}</small>
          <BranchPicker />
        </div>
        <nav className="nav">
          {groups.map((g) => {
            // The group holding the open page never folds away.
            const here = g.links.some((n) => (n.end ? loc.pathname === n.to : loc.pathname === n.to || loc.pathname.startsWith(n.to + '/')));
            const shut = closed.includes(g.title) && !here && !hidden; // the slim icon menu always shows every page
            return (
              <section className={`nav-card ${tone[g.title] || ''} ${shut ? 'closed' : ''}`} key={g.title}>
                <button type="button" className="nav-group" aria-expanded={!shut} aria-label={`${g.title} menu group`} onClick={() => toggleGroup(g.title)} title={shut ? `Show ${g.title}` : `Fold ${g.title}`}>
                  <NavIcon name={g.title} group /><span className="nav-group-label">{g.title}</span>{shut && <span className="nav-count">{g.links.length}</span>}<Chevron />
                </button>
                {!shut && g.links.map((n) => <NavLink key={n.to} to={n.to} end={n.end} onMouseEnter={(e) => showTip(e, n.label)} onMouseLeave={hideTip} onFocus={(e) => showTip(e, n.label)} onBlur={hideTip} title={hidden ? undefined : n.key ? `${n.label} (Alt+${n.key})` : n.label}><NavIcon name={n.to} /><span className="nav-item-label">{n.label}</span>{n.key && <kbd>Alt {n.key}</kbd>}</NavLink>)}
              </section>
            );
          })}
        </nav>
        <div className="rail-foot">
          <div className="who"><b>{cap1(user?.name)}</b><span className="muted">{{ sales: 'Sales staff', manager: 'Manager', technician: 'Technician', admin: 'Admin' }[user?.role] || user?.role || 'Staff'}</span></div>
          <Btn size="sm" onClick={toggleTheme} title="Switch light / dark mode">{theme === 'dark' ? 'Light' : 'Dark'}</Btn>
          <Btn size="sm" onClick={logout}>Sign out</Btn>
        </div>
      </aside>
      {/* Sits on the line between the menu and the page; slides with the menu as it narrows to icons and back. */}
      <button type="button" className="rail-toggle" onClick={toggleHidden} title={hidden ? 'Show the menu' : 'Hide the menu'} aria-label={hidden ? 'Show the menu' : 'Hide the menu'} aria-expanded={!hidden}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg>
      </button>
      {/* Slim menu: the page name in a dark tip beside the hovered icon (fixed, so the menu's scroll area cannot cut it) */}
      {hidden && tip && <div className="rail-tip" style={{ top: tip.top, left: tip.left }} role="tooltip">{tip.text}</div>}
      <div className="main">
        <div className="topbar">
          <button type="button" className="round-toggle" onClick={() => setOpen(true)} aria-label="Open menu"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg></button>
          <span>{settings.shop_name || 'Karvio'}</span>
        </div>
        {/* A page whose file is still loading shows its placeholder here only: the menu never leaves the screen. */}
        <main className="content"><Suspense fallback={<Loading />}><Outlet key={branchKey} /></Suspense></main>
      </div>
    </div>
  );
}

/** The working branch, as a badge. Users who may work in any branch get a dropdown inside it; staff fixed to one branch see just its name. */
function BranchPicker() {
  const b = useStore((s) => s.branches);
  if (!b?.on) return null;
  const active = (b.list || []).filter((x) => x.active);
  const cur = (b.list || []).find((x) => x.id === b.current) || {};
  const change = async (id) => {
    try { localStorage.setItem('karvio_branch', id); } catch { /* storage blocked */ }
    await useStore.getState().boot();
    useStore.setState((s) => ({ branchEpoch: (s.branchEpoch || 0) + 1 })); // the open page reloads with the new branch's data
    useStore.getState().toast(`Working in ${(active.find((x) => x.id === id) || {}).name || 'branch'}`);
  };
  const pick = b.can_switch && active.length > 1;
  return (
    <div className={`branch-badge ${pick ? 'can-pick' : ''}`} data-branch={b.current} title={pick ? 'The branch you are working in — click to change' : 'Your branch'} {...(pick ? {} : { role: 'status', 'aria-label': 'Working branch' })}>
      <span className="bb-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9h18v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0z" /><path d="M5 13v7h14v-7M10 20v-4h4v4" /></svg></span>
      <span className="bb-text"><small>Working in</small><b>{cur.name || 'Branch'}</b></span>
      {cur.main ? <span className="bb-tag">Main</span> : <span className="bb-dot" aria-hidden="true" />}
      {pick && <>
        <svg className="bb-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        <select className="bb-select" value={b.current} onChange={(e) => change(e.target.value)} aria-label="Working branch">{active.map((x) => <option key={x.id} value={x.id}>{x.name}{x.main ? ' (Main)' : ''}</option>)}</select>
      </>}
    </div>
  );
}
