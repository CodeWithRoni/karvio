import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import { useApi, PageHead, Modal, Btn, Field, useAction, Badge, ErrorBox, Tabs } from '../components/ui';

const ROLE = { admin: 'Admin', manager: 'Manager', sales: 'Sales staff' };

export default function Users() {
  const list = useApi('users.list', {});
  const [tab, setTab] = useState('users');
  const [edit, setEdit] = useState(null);
  return (
    <>
      <PageHead title="Users & roles" sub="Admins can do everything. Choose exactly what managers and sales staff can see and do.">
        <Tabs tabs={[['users', 'Users'], ['roles', 'Role permissions']]} value={tab} onChange={setTab} />
        {tab === 'users' && <Btn kind="primary" onClick={() => setEdit({ name: '', username: '', password: '', role: 'sales', active: true })}>Add user</Btn>}
      </PageHead>
      {tab === 'users' ? (
        <>
          <ErrorBox error={list.error} onRetry={list.reload} />
          <DataTable title="Users" loading={list.loading} rows={list.data || []} onRowClick={(u) => setEdit({ ...u, password: '' })} exportable={false}
            columns={[
              { key: 'name', label: 'Name' }, { key: 'username', label: 'Username' },
              { key: 'role', label: 'Role', value: (r) => ROLE[r.role] }, { key: 'active', label: 'Status', render: (r) => <Badge tone={r.active ? 'ok' : 'muted'}>{r.active ? 'Active' : 'Disabled'}</Badge> }
            ]} />
        </>
      ) : <RolePerms />}
      {edit && <UserForm initial={edit} onClose={() => setEdit(null)} onDone={list.reload} />}
    </>
  );
}

function UserForm({ initial, onClose, onDone }) {
  const [f, setF] = useState(initial);
  const [busy, run] = useAction();
  const save = async () => { await run(() => api('user.save', f), 'User saved'); onDone(); onClose(); };
  return (
    <Modal open onClose={onClose} size="sm" title={f.id ? `Edit ${f.name}` : 'Add user'} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save user</Btn></>}>
      <div className="form">
        <Field label="Full name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Username" wide><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" /></Field>
        <Field label={f.id ? 'New password' : 'Password'} wide hint={f.id ? 'Leave blank to keep the current password.' : 'At least 6 characters.'}><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Role" wide><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {f.id && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Can sign in</label>}
      </div>
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
    setCfg(c || {
      manager: ['pos', 'sales.all', 'sales.return', 'purchase', 'products', 'cost', 'customers', 'suppliers', 'accounts', 'expenses', 'warranty', 'reports'],
      sales: ['pos', 'warranty']
    });
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
        <thead><tr><th style={{ textAlign: 'left' }}>Permission</th><th>Manager</th><th>Sales staff</th></tr></thead>
        <tbody>{Object.entries(permLabels).map(([k, label]) => (
          <tr key={k}><td>{label}{(k === 'cancel' || k === 'cost') && <Badge tone="warn">sensitive</Badge>}</td>
            {['manager', 'sales'].map((r) => <td key={r} style={{ textAlign: 'center' }}><input type="checkbox" checked={cfg[r].includes(k)} onChange={() => toggle(r, k)} aria-label={`${label} for ${r}`} /></td>)}
          </tr>
        ))}</tbody>
      </table></div>
      <p className="muted">Cancelling a transaction always needs an admin password, even when a manager has the permission.</p>
      <div className="row end"><Btn kind="primary" busy={busy} onClick={save}>Save permissions</Btn></div>
    </div>
  );
}
