import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { getApiConfig, setApiConfig, testConnection, endpoint } from '../lib/api';
import { Btn, Field } from '../components/ui';

export default function Login() {
  const login = useStore((s) => s.login);
  const [cfg, setCfg] = useState(getApiConfig());
  const [showApi, setShowApi] = useState(!endpoint());
  const [f, setF] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  // why the last session ended (e.g. outside working hours) — shown once
  const [err, setErr] = useState(() => { const n = useStore.getState().authNote || ''; return /sign in again|please sign in/i.test(n) ? '' : n; });
  useEffect(() => { if (useStore.getState().authNote) useStore.setState({ authNote: '' }); }, []);
  const [ok, setOk] = useState('');

  const saveApi = async (e) => {
    e.preventDefault(); setErr(''); setOk(''); setBusy(true);
    try {
      const url = (cfg.proxyUrl || cfg.scriptUrl || '').trim();
      if (!url) throw new Error('Paste your Apps Script Web App URL first.');
      const r = await testConnection(url);
      setApiConfig(cfg); setOk(`Connected to ${r.app} v${r.version}`); setShowApi(false);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await login(f.username, f.password); } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <img className="auth-logo" src={`${import.meta.env.BASE_URL}karvio-logo.png`} alt="Karvio" />
        {showApi ? (
          <>
            <h1>Connect your shop</h1>
            <p className="muted">Paste the Web App URL from your Google Apps Script deployment. You can change it later in Settings.</p>
            <form onSubmit={saveApi}>
              <Field label="Apps Script Web App URL"><input value={cfg.scriptUrl || ''} onChange={(e) => setCfg({ ...cfg, scriptUrl: e.target.value })} placeholder="https://script.google.com/macros/s/…/exec" autoFocus /></Field>
              <Field label="Custom proxy domain (optional)" hint="Only if you route the API through your own domain."><input value={cfg.proxyUrl || ''} onChange={(e) => setCfg({ ...cfg, proxyUrl: e.target.value })} placeholder="https://api.yourshop.com" /></Field>
              {err && <div className="errbox">{err}</div>}
              <Btn kind="primary" size="lg" busy={busy} type="submit">Test & save connection</Btn>
              {endpoint() && <button type="button" className="link" onClick={() => setShowApi(false)}>Back to sign in</button>}
            </form>
          </>
        ) : (
          <>
            <h1>Sign in</h1>
            <p className="muted">{ok || 'Use the account your admin created for you.'}</p>
            <form onSubmit={submit}>
              <Field label="Username"><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="username" autoFocus required /></Field>
              <Field label="Password"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required /></Field>
              {err && <div className="errbox">{err}</div>}
              <Btn kind="primary" size="lg" busy={busy} type="submit">Sign in</Btn>
              <button type="button" className="link" onClick={() => setShowApi(true)}>Change API connection</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
