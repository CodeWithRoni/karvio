import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { fdatetime, qty as fqty } from '../lib/format';
import { useApi, PageHead, Btn, Field, ErrorBox, Badge, Empty, Loading, useAction, Modal, Tabs } from '../components/ui';
import { ProductSearch } from '../components/widgets';

const ST = { in_transit: ['On the way', 'warn'], received: ['Received', 'ok'], cancelled: ['Cancelled', 'muted'] };

/** Stock → Branch transfer: send stock to another branch; it waits "on the way" until that branch takes it in. */
export default function BranchTransfer() {
  const b = useStore((s) => s.branches);
  const q = useApi('branch.transfers', {}, [b?.current]);
  const [tab, setTab] = useState('open');
  const [sending, setSending] = useState(false);
  const [busy, run] = useAction();
  if (!b?.on) return <><PageHead title="Branch transfer" /><Empty icon="receipt" title="Branches are off">An admin can add branches in Settings → Branches.</Empty></>;
  const name = (id) => (b.list.find((x) => x.id === id) || {}).name || '';
  const list = (q.data?.transfers || []).filter((t) => (tab === 'open' ? t.status === 'in_transit' : t.status !== 'in_transit'));
  const finish = async (t, receive) => { const r = await run(() => api(receive ? 'branch.transfer.receive' : 'branch.transfer.cancel', { id: t.id }), receive ? `${t.no} received in ${t.to_name}` : `${t.no} cancelled — stock back in ${t.from_name}`); if (r) q.reload(); };
  return (
    <>
      <PageHead title="Branch transfer" sub={`Send stock from ${name(b.current)} to another branch. It is on the way until that branch takes it in.`}>
        <Tabs tabs={[['open', 'On the way'], ['done', 'Done']]} value={tab} onChange={setTab} />
        <Btn kind="primary" onClick={() => setSending(true)}>➜ Send stock</Btn>
      </PageHead>
      <ErrorBox error={q.error} onRetry={q.reload} />
      {q.loading && !q.data ? <Loading label="Reading transfers" /> : list.length ? (
        <div className="bt-list">{list.map((t) => (
          <section className="card" key={t.id}>
            <div className="card-head"><h2>{t.no} · {t.from_name} ➜ {t.to_name}</h2><Badge tone={ST[t.status][1]}>{ST[t.status][0]}</Badge></div>
            <table className="dc-hist"><tbody>{t.items.map((l) => <tr key={l.product_id}><td>{l.name}</td><td className="r num">{fqty(l.qty, l.unit)}</td><td className="muted">{l.serials?.length ? l.serials.join(', ') : ''}</td></tr>)}</tbody></table>
            <p className="muted" style={{ marginBottom: 0 }}>Sent {fdatetime(t.sent_at)} by {t.sent_by}{t.note ? ` · ${t.note}` : ''}{t.done_at ? ` · ${t.status} ${fdatetime(t.done_at)} by ${t.done_by}` : ''}</p>
            {t.status === 'in_transit' && <div className="dc-actions">
              {(b.can_switch || b.mine === t.from) && <Btn busy={busy} onClick={() => finish(t, false)}>Cancel — bring back</Btn>}
              {(b.can_switch ? b.current === t.to : b.mine === t.to) && <Btn kind="primary" busy={busy} onClick={() => finish(t, true)}>✓ Take it in</Btn>}
              {b.can_switch && b.current !== t.to && <span className="muted">Switch to {t.to_name} to take it in.</span>}
            </div>}
          </section>))}</div>
      ) : <Empty icon="receipt" title={tab === 'open' ? 'Nothing on the way' : 'No finished transfers yet'}>Transfers you send or receive are listed here.</Empty>}
      {sending && <SendDialog b={b} onClose={() => setSending(false)} onDone={() => { setSending(false); q.reload(); useStore.getState().refresh('products').catch(() => {}); }} />}
    </>
  );
}

function SendDialog({ b, onClose, onDone }) {
  const others = b.list.filter((x) => x.active && x.id !== b.current);
  const [to, setTo] = useState(others[0]?.id || '');
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('');
  const [busy, run] = useAction();
  const products = useStore((s) => s.products);
  const add = (p) => {
    if (items.some((i) => i.product_id === p.id)) return;
    const serial = p.has_warranty && p.warranty_type === 'serial' && !p.service;
    setItems([...items, { product_id: p.id, name: p.name, unit: p.unit, serial, qty: serial ? '' : '1', serials: '' }]);
  };
  const set = (id, k, v) => setItems(items.map((i) => (i.product_id === id ? { ...i, [k]: v } : i)));
  const here = (id) => products.find((p) => p.id === id)?.stock ?? 0;
  const send = async () => {
    const r = await run(() => api('branch.transfer.send', { to, note, items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, serials: i.serials })) }), 'Stock sent');
    if (r) onDone();
  };
  return (
    <Modal open size="lg" title="Send stock to another branch" onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={send} disabled={!to || !items.length}>➜ Send</Btn></>}>
      <div className="form">
        <Field label="Send to" wide><select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Send to">{others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <div className="wide"><ProductSearch noServices onPick={add} placeholder="Add a product: search or scan" /></div>
        {items.length > 0 && <table className="dc-hist wide"><thead><tr><th>Product</th><th className="r">Here now</th><th>Send</th><th /></tr></thead>
          <tbody>{items.map((i) => <tr key={i.product_id}><td>{i.name}</td><td className="r num">{fqty(here(i.product_id), i.unit)}</td>
            <td>{i.serial ? <input value={i.serials} onChange={(e) => set(i.product_id, 'serials', e.target.value)} placeholder="Serial numbers: SN1, SN2" aria-label={`Serials of ${i.name}`} />
              : <input className="sc-in" type="number" min="0" step="any" value={i.qty} onChange={(e) => set(i.product_id, 'qty', e.target.value)} aria-label={`Quantity of ${i.name}`} />}</td>
            <td className="r"><Btn size="sm" kind="danger" onClick={() => setItems(items.filter((x) => x.product_id !== i.product_id))} aria-label={`Remove ${i.name}`}>×</Btn></td></tr>)}</tbody></table>}
        <Field label="Note" wide><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Optional" aria-label="Note" /></Field>
      </div>
    </Modal>
  );
}
