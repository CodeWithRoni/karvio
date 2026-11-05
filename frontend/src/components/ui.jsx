import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';

/* ---------- hooks ---------- */

/** Run an API call and keep {data, loading, error}. Re-runs when deps change. */
export function useApi(action, payload, deps = [], { skip = false, refreshMs = 0 } = {}) {
  const [state, set] = useState({ data: null, loading: !skip, error: '' });
  const active = useRef(false);
  const request = useRef(0);
  const key = JSON.stringify(payload);
  const run = useCallback(async () => {
    if (skip || active.current) return;
    active.current = true;
    const id = ++request.current;
    set((s) => ({ ...s, loading: true, error: '' }));
    try { const data = await api(action, payload); if (id === request.current) set({ data, loading: false, error: '' }); return data; }
    catch (e) { if (id === request.current) set((s) => ({ ...s, loading: false, error: e.message })); }
    finally { if (id === request.current) active.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, key, skip, ...deps]);
  useEffect(() => {
    run();
    return () => { request.current++; active.current = false; };
  }, [run]);
  useEffect(() => {
    if (skip || !refreshMs) return;
    const refresh = () => { if (!document.hidden) run(); };
    const timer = window.setInterval(refresh, refreshMs);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [run, skip, refreshMs]);
  return { ...state, reload: run, setData: (d) => set((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/** Wrap an async action with a busy flag and toast on error / success. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const toast = useStore((s) => s.toast);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(e.message, 'err'); throw e; }
    finally { setBusy(false); }
  };
  return [busy, run];
}

/** Promise-based confirmation dialog shared by editable master-data lists. */
export function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolve = useRef(null);
  useEffect(() => () => { resolve.current?.(false); resolve.current = null; }, []);
  const finish = (answer) => {
    resolve.current?.(answer); resolve.current = null; setOptions(null);
  };
  const ask = (next) => new Promise((done) => {
    resolve.current?.(false); resolve.current = done; setOptions(next);
  });
  const dialog = options ? <Modal open title={options.title || 'Confirm'} size="sm" onClose={() => finish(false)} footer={<><Btn onClick={() => finish(false)}>{options.cancelLabel || 'Cancel'}</Btn><Btn kind="danger" onClick={() => finish(true)}>{options.confirmLabel || 'Delete'}</Btn></>}><p>{options.message}</p></Modal> : null;
  return [dialog, ask];
}

export function useHotkeys(map, deps = []) {
  useEffect(() => {
    const h = (e) => {
      const k = (e.ctrlKey || e.metaKey ? 'mod+' : '') + (e.altKey ? 'alt+' : '') + e.key.toLowerCase();
      const fn = map[k] || map[e.key];
      if (fn) { e.preventDefault(); fn(e); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ---------- primitives ---------- */

export function Btn({ kind = 'ghost', size, busy, children, className = '', ...p }) {
  return (
    <button className={`btn btn-${kind} ${size ? 'btn-' + size : ''} ${className}`} disabled={busy || p.disabled} {...p}>
      {busy && <span className="spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, wide, className = '' }) {
  return (
    <label className={`field ${wide ? 'wide' : ''} ${error ? 'has-error' : ''} ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="field-hint field-error" role="alert">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Badge({ tone = 'muted', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export const statusTone = (s) => ({
  active: 'ok', cancelled: 'bad', Pending: 'warn', 'Sent to Vendor': 'info', Repaired: 'ok', Replaced: 'ok', Delivered: 'muted', Rejected: 'bad',
  in_stock: 'ok', sold: 'info', returned_supplier: 'warn'
}[s] || 'muted');

export function Empty({ title = 'Nothing here yet', children }) {
  return <div className="empty"><b>{title}</b>{children && <div>{children}</div>}</div>;
}
export function Loading({ label = 'Loading' }) {
  return <div className="loading"><span className="spin" /> {label}…</div>;
}
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return <div className="errbox">{error} {onRetry && <Btn size="sm" onClick={onRetry}>Try again</Btn>}</div>;
}

export function PageHead({ title, sub, children, center }) {
  return (
    <header className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {center}
      <div className="page-actions">{children}</div>
    </header>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => {
        const [v, l] = Array.isArray(t) ? t : [t, t];
        return <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>;
      })}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    const first = ref.current?.querySelector('input,select,textarea,button:not(.x)');
    first?.focus();
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal modal-${size}`} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>)}
    </div>
  );
}

export function DateRange({ from, to, onChange }) {
  return (
    <div className="daterange">
      <input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} aria-label="From date" />
      <span>to</span>
      <input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} aria-label="To date" />
    </div>
  );
}

/** <select> that takes [{id,name}] */
export function Select({ value, onChange, options, placeholder = 'Select…', allowEmpty = true, ...p }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.id} value={o.id}>{o.name ?? o.label}</option>)}
    </select>
  );
}

export function DeleteBtn({ onClick, label = 'Delete', ...p }) {
  return <button type="button" className="del-btn" onClick={onClick} {...p}><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>{label}</button>;
}
