import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api, getApiConfig, setApiConfig, testConnection, endpoint, isOffline } from '../lib/api';
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
  const [setup, setSetup] = useState(false);
  const [owner, setOwner] = useState({name:'',setup_key:'',password:'',confirm:''});
  useEffect(() => {
    let active=true;
    if (!isOffline() && endpoint()) testConnection(endpoint()).then(r=>{if(active)setSetup(r.backend==='supabase'&&r.requiresSetup===true);}).catch(()=>{});
    return ()=>{active=false;};
  }, []);
  const initialize = async e => {
    e.preventDefault();setErr('');
    if(owner.password!==owner.confirm){setErr('The passwords do not match.');return;}
    setBusy(true);
    try {
      await api('owner.initialize',{name:owner.name,setup_key:owner.setup_key,password:owner.password});
      setOwner({name:'',setup_key:'',password:'',confirm:''});setSetup(false);
      setF({username:'admin',password:''});setOk('Owner account created. Sign in with your chosen password.');
    }catch(error){setErr(error.message);}
    setBusy(false);
  };

  const saveApi = async (e) => {
    e.preventDefault(); setErr(''); setOk(''); setBusy(true);
    try {
      const url = (cfg.proxyUrl || cfg.scriptUrl || '').trim();
      if (!url) throw new Error('Paste your shop API URL first.');
      const r = await testConnection(url);
      setApiConfig(cfg); setOk(`Connected to ${r.app} v${r.version}`); setSetup(r.backend==='supabase'&&r.requiresSetup===true); setShowApi(false);
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
            <p className="muted">Paste your Google Apps Script Web App URL or Supabase shop API URL. You can change it later in Settings.</p>
            <form onSubmit={saveApi}>
              <Field label="Shop API URL"><input value={cfg.scriptUrl || ''} onChange={(e) => setCfg({ ...cfg, scriptUrl: e.target.value })} placeholder="https://…/exec or https://…/functions/v1/karvio-api" autoFocus /></Field>
              <Field label="Custom proxy domain (optional)" hint="Only if you route the API through your own domain."><input value={cfg.proxyUrl || ''} onChange={(e) => setCfg({ ...cfg, proxyUrl: e.target.value })} placeholder="https://api.yourshop.com" /></Field>
              {err && <div className="errbox">{err}</div>}
              <Btn kind="primary" size="lg" busy={busy} type="submit">Test & save connection</Btn>
              {endpoint() && <button type="button" className="link" onClick={() => setShowApi(false)}>Back to sign in</button>}
            </form>
          </>
        ) : setup ? (
          <>
            <h1>Set up your fresh shop</h1>
            <p className="muted">Create your Administrator account. Username: admin. Your shop starts with no old products or transactions.</p>
            <form onSubmit={initialize}>
              <Field label="Your name"><input value={owner.name} onChange={e=>setOwner({...owner,name:e.target.value})} required maxLength={100} autoComplete="name" /></Field>
              <Field label="One-time setup key"><input type="password" value={owner.setup_key} onChange={e=>setOwner({...owner,setup_key:e.target.value})} required autoComplete="off" /></Field>
              <Field label="Choose a password (at least 12 characters)"><input type="password" value={owner.password} onChange={e=>setOwner({...owner,password:e.target.value})} required minLength={12} autoComplete="new-password" /></Field>
              <Field label="Confirm password"><input type="password" value={owner.confirm} onChange={e=>setOwner({...owner,confirm:e.target.value})} required minLength={12} autoComplete="new-password" /></Field>
              {err && <div className="errbox">{err}</div>}
              <Btn kind="primary" size="lg" busy={busy} type="submit">Create Administrator account</Btn>
              <button type="button" className="link" onClick={()=>setShowApi(true)}>Change API connection</button>
            </form>
          </>
        ) : (
          <>
            <h1>Sign in</h1>
            <p className="muted">{isOffline() ? 'Offline — this computer has a separate database. Your online shop data is not shown or synced here.' : ok || 'Online shop — sign in with your existing shop account.'}</p>
            <form onSubmit={submit}>
              <Field label="Username"><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="username" autoFocus required /></Field>
              <Field label="Password"><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required /></Field>
              {err && <div className="errbox">{err}</div>}
              <Btn kind="primary" size="lg" busy={busy} type="submit">Sign in</Btn>
              {!isOffline() && <button type="button" className="link" onClick={() => setShowApi(true)}>Change API connection</button>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
