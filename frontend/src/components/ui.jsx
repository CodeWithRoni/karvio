import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';

/* ---------- hooks ---------- */

/** Run an API call and keep {data, loading, error}. Re-runs when deps change. */
export function useApi(action, payload, deps = [], { skip = false } = {}) {
  const [state, set] = useState({ data: null, loading: !skip, error: '' });
  const key = JSON.stringify(payload);
  const run = useCallback(async () => {
    if (skip) return;
    set((s) => ({ ...s, loading: true, error: '' }));
    try { const data = await api(action, payload); set({ data, loading: false, error: '' }); return data; }
    catch (e) { set({ data: null, loading: false, error: e.message }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, key, skip, ...deps]);
  useEffect(() => { run(); }, [run]);
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

export function Field({ label, hint, children, wide, className = '' }) {
  return (
    <label className={`field ${wide ? 'wide' : ''} ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
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

/* ---------- confirmation popup ---------- */

/**
 * const [confirmUI, ask] = useConfirm();
 * if (await ask({ title, message, confirmLabel })) { ...delete... }
 * Render {confirmUI} somewhere in the component.
 */
export function useConfirm() {
  const [state, setState] = useState(null);
  const ask = (opts) => new Promise((resolve) => setState({ ...opts, resolve }));
  const close = (answer) => { state?.resolve(answer); setState(null); };
  const ui = (
    <Modal open={!!state} onClose={() => close(false)} title={state?.title || 'Are you sure?'} size="sm"
      footer={<>
        <Btn onClick={() => close(false)}>{state?.cancelLabel || 'No'}</Btn>
        <Btn kind="danger" onClick={() => close(true)} autoFocus>{state?.confirmLabel || 'Yes, delete'}</Btn>
      </>}>
      <p style={{ margin: 0 }}>{state?.message}</p>
    </Modal>
  );
  return [ui, ask];
}

export function DeleteBtn({ onClick, label = 'Delete', ...p }) {
  return (
    <button type="button" className="del-btn" onClick={onClick} {...p}>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
      </svg>
      {label}
    </button>
  );
}
