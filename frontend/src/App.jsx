import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import { endpoint } from './lib/api';
import Layout from './components/Layout';
import { Loading, Toasts, Btn } from './components/ui';
import Login from './pages/Login';
import { NativeShell } from './components/NativeShell';
import SelectPopup from './components/SelectPopup';

// Route-level code splitting keeps the first load fast.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Sales = lazy(() => import('./pages/Sales'));
const PCBuilder = lazy(() => import('./pages/PCBuilder'));
const Customers = lazy(() => import('./pages/Customers'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Stock = lazy(() => import('./pages/Stock'));
const Purchases = lazy(() => import('./pages/Purchases'));
const Prices = lazy(() => import('./pages/Prices'));
const Barcodes = lazy(() => import('./pages/Barcodes'));
const Warranty = lazy(() => import('./pages/Warranty'));
const Repairs = lazy(() => import('./pages/Repairs'));
const Service = lazy(() => import('./pages/Service'));
const History = lazy(() => import('./pages/History'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Profit = lazy(() => import('./pages/Profit'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const PublicInvoice = lazy(() => import('./pages/PublicInvoice'));
const PublicQuote = lazy(() => import('./pages/PublicQuote'));

/** #/i/<key>: a customer's invoice link (from the sale SMS) — shown without signing in. */
const linkToken = () => (/^#\/i\/([A-Za-z0-9]{1,64})\/?$/.exec(window.location.hash) || [])[1] || '';
/** #/q/<key>: a quotation link (from the PC builder SMS) — shown without signing in, valid 3 days. */
const quoteToken = () => (/^#\/q\/([A-Za-z0-9]{1,64})\/?$/.exec(window.location.hash) || [])[1] || '';

function Guard({ perm, children }) {
  const can = useStore((s) => s.can);
  if (perm && !can(perm)) return <div className="empty"><b>You don't have access to this page</b><div>Ask an admin to grant the permission in Users & roles.</div></div>;
  return children;
}

export default function App() {
  const { theme, token, user, booting, bootError, boot, logout } = useStore();
  const [connected, setConnected] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setConnected(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const [pub, setPub] = useState(linkToken);
  const [pubQuote, setPubQuote] = useState(quoteToken);
  useEffect(() => {
    // Capture also covers lazy pages, portal dialogs and future native inputs.
    // Blur before the browser's wheel step; keep the wheel passive so the page scrolls.
    const guard = () => {
      const active = document.activeElement;
      const steppedInput = active instanceof HTMLInputElement && ['number', 'range', 'date', 'time', 'datetime-local', 'month', 'week'].includes(active.type);
      const closedSelect = active instanceof HTMLSelectElement && active.size <= 1;
      if (steppedInput || closedSelect) active.blur();
    };
    document.addEventListener('wheel', guard, {capture:true, passive:true});
    return () => document.removeEventListener('wheel', guard, true);
  }, []);
  useEffect(() => { const h = () => { setPub(linkToken()); setPubQuote(quoteToken()); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!pub && !pubQuote && token && !user && endpoint()) boot().catch(() => {}); }, [pub, pubQuote, token, user, boot]);

  let body;
  if (pubQuote) body = <Suspense fallback={<Loading />}><PublicQuote token={pubQuote} /></Suspense>;
  else if (pub) body = <Suspense fallback={<Loading />}><PublicInvoice token={pub} /></Suspense>;
  else if (!token || !endpoint()) body = <Login />;
  else if (!user) {
    body = (
      <div className="auth"><div className="auth-card">
        {bootError ? <><div className="errbox">{bootError}</div><div className="row"><Btn kind="primary" onClick={() => boot().catch(() => {})}>Try again</Btn><Btn onClick={logout}>Sign out</Btn></div></> : <Loading label={booting ? 'Loading your shop' : 'Starting'} />}
      </div></div>
    );
  } else {
    body = (
      <HashRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="pos" element={<Guard perm="pos"><POS /></Guard>} />
              <Route path="sales" element={<Guard perm="pos"><Sales /></Guard>} />
              <Route path="sales/:id" element={<Guard perm="pos"><Sales /></Guard>} />
              <Route path="pc-builder" element={<Guard perm="pos"><PCBuilder /></Guard>} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<Customers />} />
              <Route path="suppliers" element={<Guard perm="suppliers"><Suppliers /></Guard>} />
              <Route path="suppliers/:id" element={<Guard perm="suppliers"><Suppliers /></Guard>} />
              <Route path="stock" element={<Stock />} />
              <Route path="barcodes" element={<Barcodes />} />
              <Route path="prices" element={<Guard perm="products"><Prices /></Guard>} />
              <Route path="purchases" element={<Guard perm="purchase"><Purchases /></Guard>} />
              <Route path="warranty" element={<Guard perm="warranty"><Warranty /></Guard>} />
              <Route path="repairs" element={<Guard perm="repairs"><Repairs /></Guard>} />
              <Route path="repairs/:id" element={<Guard perm="repairs"><Repairs /></Guard>} />
              <Route path="service" element={<Guard perm="repairs"><Service /></Guard>} />
              <Route path="history" element={<History />} />
              <Route path="accounts" element={<Guard perm="accounts"><Accounts /></Guard>} />
              <Route path="profit" element={<Guard perm={['reports', 'cost']}><Profit /></Guard>} />
              <Route path="expenses" element={<Guard perm="expenses"><Expenses /></Guard>} />
              <Route path="reports" element={<Guard perm="reports"><Reports /></Guard>} />
              <Route path="users" element={<Guard perm="users"><Users /></Guard>} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    );
  }
  return <><div className="online-app" inert={!connected ? '' : undefined} aria-hidden={!connected ? true : undefined}>{body}<Toasts /><NativeShell /><SelectPopup /></div>{!connected && <div role="alertdialog" aria-modal="true" aria-labelledby="connection-title" style={{position:'fixed',inset:0,zIndex:100000,display:'grid',placeItems:'center',background:'#0d1b2a',padding:24}}><div className="auth-card"><h2 id="connection-title">Internet connection required</h2><p>Karvio works online only. Reconnect to continue. Your current form stays open.</p></div></div>}</>;
}
