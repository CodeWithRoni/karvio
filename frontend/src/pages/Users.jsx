import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { cap1 } from '../lib/format';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Modal, Btn, Field, useAction, Badge, ErrorBox, Tabs } from '../components/ui';
import Sessions from '../components/Sessions';

const ROLE = { admin: 'Admin', manager: 'Manager', sales: 'Sales staff', technician: 'Technician' };

export default function Users() {
  const list = useApi('users.list', {});
  const [tab, setTab] = useState('users');
  const [edit, setEdit] = useState(null);
  const isAdmin = useStore((s) => s.user?.role === 'admin');
  const branches = useStore((s) => s.branches);
  const bName = (id) => (branches?.list || []).find((b) => b.id === id)?.name || '';
  return (
    <>
      <PageHead title="Users & roles" sub="Admins can do everything. Choose exactly what managers, sales staff and technicians can see and do.">
        <Tabs tabs={[['users', 'Users'], ...(isAdmin ? [['roles', 'Role permissions']] : []), ['devices', 'Devices & logins']]} value={tab} onChange={setTab} />
        {tab === 'users' && <Btn kind="primary" onClick={() => setEdit({ name: '', username: '', password: '', role: 'sales', active: true, branch_id: '' })}>Add user</Btn>}
      </PageHead>
      {tab === 'devices' ? <Sessions /> : tab === 'users' ? (
        <>
          <ErrorBox error={list.error} onRetry={list.reload} />
          <DataTable title="Users" loading={list.loading} rows={list.data || []} onRowClick={(u) => setEdit({ ...u, password: '' })} exportable={false}
            columns={[
              { key: 'name', label: 'Name', value: (r) => cap1(r.name) }, { key: 'username', label: 'Username', value: (r) => cap1(r.username) },
              { key: 'role', label: 'Role', value: (r) => ROLE[r.role] || r.role },
              { key: 'phone', label: 'Phone' },
              ...(branches?.on ? [{ key: 'branch_id', label: 'Branch', value: (r) => bName(r.branch_id) || 'Any branch' }] : []),
              { key: 'approvals', label: 'Needs approval', value: (r) => (r.role === 'admin' || !(r.approvals || []).length ? '—' : APPROVAL_KINDS.filter(([k]) => r.approvals.includes(k)).map(([, l]) => l.replace(/ \(.*\)/, '')).join(', ')) },
              { key: 'access', label: 'Working hours', value: (r) => (r.role !== 'admin' && r.access_limit ? hoursText(r) : 'Any time') },
              { key: 'active', label: 'Status', render: (r) => <Badge tone={r.active ? 'ok' : 'muted'}>{r.active ? 'Active' : 'Disabled'}</Badge> }
            ]} />
        </>
      ) : <RolePerms />}
      {edit && <UserForm initial={edit} onClose={() => setEdit(null)} onDone={list.reload} />}
    </>
  );
}

// Bangladesh week order, Saturday first
const DAYS = [['sat', 'Sat'], ['sun', 'Sun'], ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri']];
const t12 = (hm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm || ''); if (!m) return hm || '';
  const h = Number(m[1]); return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
const dayList = (d) => String(d || '').split(',').filter(Boolean);
export function hoursText(u) {
  const days = dayList(u.access_days);
  const names = DAYS.filter(([k]) => days.includes(k)).map(([, l]) => l);
  return `${t12(u.access_from)} – ${t12(u.access_to)}${names.length === 7 || !names.length ? ', every day' : `, ${names.join(', ')}`}`;
}

function WorkingHours({ f, setF }) {
  const days = dayList(f.access_days);
  const toggleDay = (k) => setF({ ...f, access_days: (days.includes(k) ? days.filter((x) => x !== k) : [...days, k]).join(',') });
  const overnight = f.access_from && f.access_to && f.access_from > f.access_to;
  return (
    <div className="wide wh-box">
      <label className="check"><input type="checkbox" checked={!!f.access_limit}
        onChange={(e) => setF({ ...f, access_limit: e.target.checked, access_from: f.access_from || '10:00', access_to: f.access_to || '20:00', access_days: f.access_days || DAYS.map(([k]) => k).join(',') })} />
        <b>Limit working hours</b></label>
      <p className="muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>Outside these hours this person cannot sign in — even with the right password — and is signed out if already in.</p>
      {f.access_limit && (
        <>
          <div className="wh-times">
            <Field label="From"><input type="time" value={f.access_from} onChange={(e) => setF({ ...f, access_from: e.target.value })} /></Field>
            <Field label="To"><input type="time" value={f.access_to} onChange={(e) => setF({ ...f, access_to: e.target.value })} /></Field>
          </div>
          <div className="wh-days" role="group" aria-label="Working days">
            {DAYS.map(([k, l]) => <button type="button" key={k} className={`wh-day ${days.includes(k) ? 'on' : ''}`} aria-pressed={days.includes(k)} onClick={() => toggleDay(k)}>{l}</button>)}
          </div>
          <div className="wh-sum">{days.length ? <>Can use Karvio: <b>{hoursText(f)}</b>{overnight ? ' (ends after midnight)' : ''}</> : <span style={{ color: 'var(--bad)' }}>Choose at least one working day</span>}</div>
          {f.access_from && f.access_from === f.access_to && <div className="wh-sum" style={{ color: 'var(--bad)' }}>Start and end time cannot be the same</div>}
        </>
      )}
    </div>
  );
}

/** Approvals (admins only): which of this person's work waits for an admin before it is saved. */
const APPROVAL_KINDS = [['purchase', 'Purchase'], ['payment', 'Supplier payment'], ['collection', 'Collection'], ['expense', 'Expenses'], ['transfer', 'Branch transfer']];
function ApprovalPicker({ value, onChange }) {
  const has = (k) => value.includes(k);
  return (
    <fieldset className="wide apr-pick">
      <legend>Needs admin approval</legend>
      <p className="muted">Ticked work is checked and sent to Approval; nothing is saved until an admin approves it. Leave all unticked to save straight away.</p>
      <div className="apr-pick-grid">
        {APPROVAL_KINDS.map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={has(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} /> {l}</label>)}
      </div>
    </fieldset>
  );
}

function UserForm({ initial, onClose, onDone }) {
  const [f, setF] = useState(initial);
  const [busy, run] = useAction();
  const meOwner = useStore((s) => s.user?.owner === true);
  const meAdmin = useStore((s) => s.user?.role === 'admin');
  const meId = useStore((s) => s.user?.id);
  const branches = useStore((s) => s.branches);
  const openBranches = (branches?.list || []).filter((b) => b.active || b.id === initial.branch_id);
  // only the Administrator account can change itself; staff with the users permission cannot touch admins
  const locked = (!!initial.owner && !meOwner) || (!meAdmin && initial.role === 'admin');
  const save = async () => {
    const body = meAdmin && branches?.on ? f : (({ branch_id, ...rest }) => rest)(f);
    const r = await run(() => api('user.save', body), 'User saved');
    if (!r) return;
    if (meAdmin && branches?.on && (f.branch_id || '') !== (initial.branch_id || '') && f.id === meId) useStore.getState().boot();
    onDone(); onClose();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={f.id ? `Edit ${f.name}` : 'Add user'} footer={<><Btn onClick={onClose}>Cancel</Btn>{!locked && <Btn kind="primary" busy={busy} onClick={save}>Save user</Btn>}</>}>
      {locked ? <p className="muted" style={{ margin: 0 }}>{initial.owner ? <>This is the <b>Administrator</b> account (username admin). Only the Administrator can change its name or password.</> : 'Only an admin can change an admin account.'}</p> : <div className="form">
        <Field label="Full name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Username" wide hint={initial.owner ? 'The Administrator account always keeps the username admin.' : undefined}><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} readOnly={!!initial.owner} autoCapitalize="none" /></Field>
        <Field label={f.id ? 'New password' : 'Password'} wide hint={f.id ? 'At least 12 characters. Leave blank to keep the current password.' : 'At least 12 characters.'}><input type="password" minLength={12} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Role" wide><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} disabled={!meAdmin && f.id === meId}>{Object.entries(ROLE).filter(([v]) => meAdmin || v !== 'admin').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {f.role === 'technician' && <Field label="Mobile number" wide hint="Repair jobs given to this technician are sent to this number by SMS."><input value={f.phone || ''} inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>}
        {meAdmin && branches?.on && <Field label="Branch" wide hint="A user fixed to a branch sells its stock, uses its accounts and sees only its invoices. Any branch: picks the branch at the top. Also in Settings → Branches.">
          <select value={f.branch_id || ''} onChange={(e) => setF({ ...f, branch_id: e.target.value })} aria-label="Branch">
            <option value="">Any branch</option>{openBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></Field>}
        {f.id && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Can sign in</label>}
        {f.role === 'admin' ? <p className="wide muted" style={{ margin: 0, fontSize: 12.5 }}>Admins can sign in at any time (working hours apply to managers and sales staff).</p> : <WorkingHours f={f} setF={setF} />}
        {meAdmin && f.role !== 'admin' && <ApprovalPicker value={f.approvals || []} onChange={(approvals) => setF({ ...f, approvals })} />}
      </div>}
    </Modal>
  );
}

function RolePerms() {
  const { permLabels, settings, rolePerms } = useStore();
  const [cfg, setCfg] = useState(null);
  const [busy, run] = useAction();
  useEffect(() => {
    // The server sends what each role may do right now (its defaults, a role added later, a permission added later).
    if (rolePerms && typeof rolePerms === 'object') {
      setCfg(Object.fromEntries(['manager', 'sales', 'technician'].map((r) => [r, Array.isArray(rolePerms[r]) ? rolePerms[r] : []])));
      return;
    }
    // An older server without that list: the same defaults and rules as the server.
    let c = null;
    try { c = JSON.parse(settings.role_perms || 'null'); } catch {}
    const def = {
      manager: ['pos', 'sales.all', 'sales.return', 'purchase', 'products', 'cost', 'customers', 'suppliers', 'accounts', 'expenses', 'warranty', 'repairs', 'service', 'reports'],
      sales: ['pos', 'warranty'],
      technician: ['repairs', 'service']
    };
    if (!c) { setCfg(def); return; }
    const added = ['service'];
    const known = Array.isArray(c.known) ? c.known : Object.keys(permLabels).filter((k) => !added.includes(k));
    setCfg(Object.fromEntries(Object.keys(def).map((r) => {
      const list = Array.isArray(c[r]) ? c[r] : def[r];
      return [r, [...list, ...def[r].filter((k) => !known.includes(k) && !list.includes(k))]];
    })));
  }, [rolePerms, settings.role_perms, permLabels]);
  if (!cfg) return null;
  const toggle = (role, p) => setCfg({ ...cfg, [role]: cfg[role].includes(p) ? cfg[role].filter((x) => x !== p) : [...cfg[role], p] });
  const save = async () => {
    const saved = await run(() => api('rolePerms.save', cfg), 'Permissions saved — they apply on the next request');
    if (saved) useStore.setState((s) => ({ rolePerms: saved, settings: { ...s.settings, role_perms: JSON.stringify(saved) } }));
  };
  return (
    <div className="card">
      <div className="dt-scroll"><table className="perm">
        <thead><tr><th style={{ textAlign: 'left' }}>Permission</th><th>Manager</th><th>Sales staff</th><th>Technician</th></tr></thead>
        <tbody>{Object.entries(permLabels).map(([k, label]) => (
          <tr key={k}><td>{label}{(k === 'cancel' || k === 'cost') && <Badge tone="warn">sensitive</Badge>}</td>
            {['manager', 'sales', 'technician'].map((r) => <td key={r} style={{ textAlign: 'center' }}><input type="checkbox" checked={cfg[r].includes(k)} onChange={() => toggle(r, k)} aria-label={`${label} for ${r}`} /></td>)}
          </tr>
        ))}</tbody>
      </table></div>
      <p className="muted">Cancelling a transaction always needs an admin password, even when a manager has the permission.</p>
      <div className="row end"><Btn kind="primary" busy={busy} onClick={save}>Save permissions</Btn></div>
    </div>
  );
}
