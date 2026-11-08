import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Modal, Btn, Field, useAction, Badge, ErrorBox, Tabs } from '../components/ui';

const ROLE = { admin: 'Admin', manager: 'Manager', sales: 'Sales staff', technician: 'Technician' };

export default function Users() {
  const list = useApi('users.list', {});
  const [tab, setTab] = useState('users');
  const [edit, setEdit] = useState(null);
  const isAdmin = useStore((s) => s.user?.role === 'admin');
  return (
    <>
      <PageHead title="Users & roles" sub="Admins can do everything. Choose exactly what managers, sales staff and technicians can see and do.">
        <Tabs tabs={[['users', 'Users'], ...(isAdmin ? [['roles', 'Role permissions']] : [])]} value={tab} onChange={setTab} />
        {tab === 'users' && <Btn kind="primary" onClick={() => setEdit({ name: '', username: '', password: '', role: 'sales', active: true })}>Add user</Btn>}
      </PageHead>
      {tab === 'users' ? (
        <>
          <ErrorBox error={list.error} onRetry={list.reload} />
          <DataTable title="Users" loading={list.loading} rows={list.data || []} onRowClick={(u) => setEdit({ ...u, password: '' })} exportable={false}
            columns={[
              { key: 'name', label: 'Name' }, { key: 'username', label: 'Username' },
              { key: 'role', label: 'Role', value: (r) => ROLE[r.role] || r.role },
              { key: 'phone', label: 'Phone' },
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

function UserForm({ initial, onClose, onDone }) {
  const [f, setF] = useState(initial);
  const [busy, run] = useAction();
  const meOwner = useStore((s) => s.user?.owner === true);
  const meAdmin = useStore((s) => s.user?.role === 'admin');
  const meId = useStore((s) => s.user?.id);
  // only the Administrator account can change itself; staff with the users permission cannot touch admins
  const locked = (!!initial.owner && !meOwner) || (!meAdmin && initial.role === 'admin');
  const save = async () => { await run(() => api('user.save', f), 'User saved'); onDone(); onClose(); };
  return (
    <Modal open onClose={onClose} size="sm" title={f.id ? `Edit ${f.name}` : 'Add user'} footer={<><Btn onClick={onClose}>Cancel</Btn>{!locked && <Btn kind="primary" busy={busy} onClick={save}>Save user</Btn>}</>}>
      {locked ? <p className="muted" style={{ margin: 0 }}>{initial.owner ? <>This is the <b>Administrator</b> account (username admin). Only the Administrator can change its name or password.</> : 'Only an admin can change an admin account.'}</p> : <div className="form">
        <Field label="Full name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Username" wide hint={initial.owner ? 'The Administrator account always keeps the username admin.' : undefined}><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} readOnly={!!initial.owner} autoCapitalize="none" /></Field>
        <Field label={f.id ? 'New password' : 'Password'} wide hint={f.id ? 'Leave blank to keep the current password.' : 'At least 6 characters.'}><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Role" wide><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} disabled={!meAdmin && f.id === meId}>{Object.entries(ROLE).filter(([v]) => meAdmin || v !== 'admin').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {f.role === 'technician' && <Field label="Mobile number" wide hint="Repair jobs given to this technician are sent to this number by SMS."><input value={f.phone || ''} inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>}
        {f.id && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Can sign in</label>}
        {f.role === 'admin' ? <p className="wide muted" style={{ margin: 0, fontSize: 12.5 }}>Admins can sign in at any time (working hours apply to managers and sales staff).</p> : <WorkingHours f={f} setF={setF} />}
      </div>}
    </Modal>
  );
}

function RolePerms() {
  const { permLabels, settings } = useStore();
  const [cfg, setCfg] = useState(null);
  const [busy, run] = useAction();
  useEffect(() => {
    let c = null;
    try { c = JSON.parse(settings.role_perms || 'null'); } catch {}
    // the same defaults as the server; a role added later (technician) starts with its defaults
    const def = {
      manager: ['pos', 'sales.all', 'sales.return', 'purchase', 'products', 'cost', 'customers', 'suppliers', 'accounts', 'expenses', 'warranty', 'repairs', 'reports'],
      sales: ['pos', 'warranty'],
      technician: ['repairs']
    };
    setCfg({ ...def, ...(c || {}), technician: (c && Array.isArray(c.technician)) ? c.technician : def.technician });
  }, [settings.role_perms]);
  if (!cfg) return null;
  const toggle = (role, p) => setCfg({ ...cfg, [role]: cfg[role].includes(p) ? cfg[role].filter((x) => x !== p) : [...cfg[role], p] });
  const save = async () => {
    await run(() => api('rolePerms.save', cfg), 'Permissions saved — they apply on the next request');
    useStore.setState((s) => ({ settings: { ...s.settings, role_perms: JSON.stringify(cfg) } }));
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
