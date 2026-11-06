import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import { endpoint } from './lib/api';
import Layout from './components/Layout';
import { Loading, Toasts, Btn } from './components/ui';
import Login from './pages/Login';
import { NativeShell } from './components/NativeShell';

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
const History = lazy(() => import('./pages/History'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));

function Guard({ perm, children }) {
  const can = useStore((s) => s.can);
  if (perm && !can(perm)) return <div className="empty"><b>You don't have access to this page</b><div>Ask an admin to grant the permission in Users & roles.</div></div>;
  return children;
}

export default function App() {
  const { theme, token, user, booting, bootError, boot, logout } = useStore();

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (token && !user && endpoint()) boot().catch(() => {}); }, [token, user, boot]);

  let body;
  if (!token || !endpoint()) body = <Login />;
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
              <Route path="history" element={<History />} />
              <Route path="accounts" element={<Guard perm="accounts"><Accounts /></Guard>} />
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
  return <>{body}<Toasts /><NativeShell /></>;
}
