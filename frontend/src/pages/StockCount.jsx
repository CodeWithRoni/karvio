import { stockCountKey, loadStockCount as load, saveStockCount as save } from '../lib/stockCountDraft';
import { roundDecimal } from '../lib/round';
import { onShopDraftsCleared } from '../lib/shopStorage';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { money, qty as fqty, fdatetime, today } from '../lib/format';
import { useApi, PageHead, Btn, Field, ErrorBox, Badge, Empty, Loading, useAction, useConfirm, Tabs, Modal } from '../components/ui';
import { ProductSearch } from '../components/widgets';
import { printTable } from '../lib/export';

const r4 = (n) => roundDecimal(n, 4);

/** Count one product: serial products by the serials found, others by the typed or scanned quantity. */
function lineOf(p, d) {
  if (p.serial) {
    const found = d.found[p.id] || [], extra = d.extra[p.id] || [];
    const touched = found.length + extra.length > 0 || d.zero;
    if (!touched) return { p, counted: null };
    const set = new Set(found);
    return { p, counted: found.length + extra.length, missing: p.serials.filter((s) => !set.has(s)), extra };
  }
  const v = d.counts[p.id];
  if (v === undefined || v === '') return { p, counted: d.zero ? 0 : null };
  return { p, counted: Number(v) };
}

/** Stock → Stock count: scan the shelf, see what is short or over, fix the stock in one step. */
export default function StockCount() {
  const [tab, setTab] = useState('count');
  useStore((state) => [state.user?.id, state.branches?.current].join('|'));
  const scope = stockCountKey();
  return (
    <>
      <PageHead title="Stock count" sub="Scan what is really on the shelf. The system shows what is short or over, then fixes the stock in one click.">
        <Tabs tabs={[['count', 'Count'], ['history', 'Past counts']]} value={tab} onChange={setTab} />
      </PageHead>
      {tab === 'count' ? <Counter key={scope} scope={scope} onApplied={() => setTab('history')} /> : <History />}
    </>
  );
}

function Counter({ onApplied, scope }) {
  const { categories, toast, refresh, can } = useStore();
  const [d, setD] = useState(load);
  useEffect(() => onShopDraftsCleared(() => setD(null)), []);
  const [name, setName] = useState(`Stock count ${today()}`);
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState('all');
  const [last, setLast] = useState('');
  const [busy, run] = useAction();
  const [confirmUI, ask] = useConfirm();
  const showCost = can('cost');
  useEffect(() => { try { save(d, scope); } catch (e) { toast(e.message || 'Could not save stock count draft', 'err'); } }, [d, scope]);

  const start = async () => {
    const r = await run(() => api('stockcount.start', { category_id: cat }));
    if (r) setD({ name: name.trim() || 'Stock count', started_at: r.at, branch_id: r.branch_id, category: r.category, products: r.products, counts: {}, found: {}, extra: {}, zero: false });
  };
  const lines = useMemo(() => (d ? d.products.map((p) => lineOf(p, d)) : []), [d]);
  if (!d) return (
    <section className="card form" style={{ maxWidth: 720 }}>
      <div className="card-head wide"><h2>Start a count</h2></div>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
      <Field label="Products to count"><select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Products to count">
        <option value="">All products</option>{(categories || []).map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{c.name}</option>)}</select></Field>
      <p className="muted wide" style={{ margin: 0 }}>The system remembers the stock now. Selling can go on while you count — every product moves by the difference you find. The count is kept on this device until you apply it.</p>
      <div className="wide row end"><Btn kind="primary" busy={busy} onClick={start}>▶ Start counting</Btn></div>
    </section>
  );

  const byId = Object.fromEntries(d.products.map((p) => [p.id, p]));
  const bump = (p, n = 1) => {
    if (!byId[p.id]) return toast(`${p.name} is not in this count`, 'err');
    if (byId[p.id].serial) return toast(`${p.name} has serial numbers — scan the serial of each piece`, 'err');
    setD((x) => ({ ...x, counts: { ...x.counts, [p.id]: String(r4((Number(x.counts[p.id]) || 0) + n)) } }));
    setLast(p.id);
  };
  const onSerial = async (raw) => {
    const code = raw.trim(), low = code.toLowerCase();
    const p = d.products.find((x) => x.serial && x.serials.some((s) => s.toLowerCase() === low));
    if (p) {
      const s = p.serials.find((x) => x.toLowerCase() === low);
      if ((d.found[p.id] || []).includes(s)) { toast(`Serial ${s} is already counted`, 'err'); return true; }
      setD((x) => ({ ...x, found: { ...x.found, [p.id]: [...(x.found[p.id] || []), s] } })); setLast(p.id);
      return true;
    }
    let hit = null;
    try { hit = await api('serials.find', { serial: code }); } catch { return false; }
    if (!hit || hit.ambiguous || !byId[hit.product_id]) return false;
    if ((d.extra[hit.product_id] || []).includes(code)) { toast(`Serial ${code} is already counted`, 'err'); return true; }
    setD((x) => ({ ...x, extra: { ...x.extra, [hit.product_id]: [...(x.extra[hit.product_id] || []), code] } })); setLast(hit.product_id);
    toast(`Serial ${code} is on the shelf but the system shows it as not in stock`, 'err');
    return true;
  };
  const counted = lines.filter((l) => l.counted !== null);
  const diffOf = (l) => (l.counted === null ? null : r4(l.counted - l.p.stock));
  const shortL = counted.filter((l) => diffOf(l) < 0), overL = counted.filter((l) => diffOf(l) > 0);
  const val = (ls) => ls.reduce((s, l) => s + (l.p.serial ? 0 : diffOf(l) * (l.p.cost || 0)), 0);
  const shown = lines.filter((l) => filter === 'all' || (filter === 'counted' && l.counted !== null) || (filter === 'short' && diffOf(l) < 0) || (filter === 'over' && diffOf(l) > 0) || (filter === 'left' && l.counted === null))
    .sort((a, b) => (b.p.id === last) - (a.p.id === last));
  const toFix = counted.filter((l) => diffOf(l) !== 0 && !l.p.serial).length;

  const apply = async () => {
    if (scope !== stockCountKey()) return toast('The user, connection or branch changed. Reopen Stock Count before continuing.', 'err');
    if (!counted.length) return toast('Count at least one product', 'err');
    if (!(await ask({ title: `Apply ${d.name}?`, message: `${counted.length} products were counted. ${toFix} will have their stock changed to the count${showCost ? ` (value ${money(val(counted))})` : ''}. Serial products are only reported. This cannot be undone here.`, confirmLabel: 'Apply the count' }))) return;
    const rec = await run(() => api('stockcount.apply', { name: d.name, started_at: d.started_at, branch_id: d.branch_id, lines: counted.map((l) => ({ product_id: l.p.id, counted: l.counted, expected: l.p.stock, missing: l.missing, extra: l.extra })) }), 'Stock count applied');
    if (!rec) return;
    setD(null); save(null); refresh('products').catch(() => {}); onApplied?.();
  };
  const discard = async () => { if (await ask({ title: 'Discard this count?', message: 'Everything counted on this device will be removed. The stock does not change.', confirmLabel: 'Discard' })) setD(null); };

  return (
    <>
      <div className="sc-head card">
        <div><b>{d.name}</b><small className="muted"> · started {fdatetime(d.started_at)}{d.category ? ` · ${d.category}` : ' · all products'}</small></div>
        <div className="row"><Btn kind="danger" onClick={discard}>Discard</Btn><Btn kind="primary" busy={busy} onClick={apply} disabled={!counted.length}>✓ Apply count{toFix ? ` · fix ${toFix}` : ''}</Btn></div>
      </div>
      <div className="sc-scan card">
        <ProductSearch camera noServices onPick={(p) => bump(p)} onCode={onSerial} autoFocus placeholder="Scan a barcode or serial, or type a product name — each scan adds 1" />
        <label className="check"><input type="checkbox" checked={d.zero} onChange={(e) => setD({ ...d, zero: e.target.checked })} /> Products I did not count are 0 (whole-shelf count)</label>
      </div>
      <div className="db-sum">
        <div className="card"><span>Counted</span><b className="num">{counted.length} / {lines.length}</b><small>{lines.length - counted.length} not counted yet</small></div>
        <div className="card"><span>Matches</span><b className="num">{counted.length - shortL.length - overL.length}</b><small>products</small></div>
        <div className="card out"><span>Short</span><b className="num">{shortL.length}</b><small>{showCost ? `${money(Math.abs(val(shortL)))} at cost` : 'products'}</small></div>
        <div className="card in"><span>Over</span><b className="num">{overL.length}</b><small>{showCost ? `${money(val(overL))} at cost` : 'products'}</small></div>
      </div>
      <section className="card">
        <div className="card-head"><Tabs tabs={[['all', 'All'], ['counted', 'Counted'], ['short', 'Short'], ['over', 'Over'], ['left', 'Not counted']]} value={filter} onChange={setFilter} /></div>
        {shown.length ? <div className="dt-scroll"><table className="dc-hist sc-table">
          <thead><tr><th>Product</th><th className="r">System</th><th className="r">Counted</th><th className="r">Difference</th>{showCost && <th className="r">Value</th>}<th /></tr></thead>
          <tbody>{shown.slice(0, 400).map((l) => {
            const df = diffOf(l);
            return (
              <tr key={l.p.id} className={l.p.id === last ? 'sc-last' : ''}>
                <td><b>{l.p.name}</b><small className="muted"> {l.p.sku || l.p.barcode}{l.p.category ? ` · ${l.p.category}` : ''}</small>
                  {l.p.serial && l.counted !== null && (l.missing.length > 0 || l.extra.length > 0) && <div className="sc-ser">
                    {l.missing.length > 0 && <span className="bad">Missing: {l.missing.slice(0, 12).join(', ')}{l.missing.length > 12 ? ` +${l.missing.length - 12}` : ''}</span>}
                    {l.extra.length > 0 && <span className="warn">Not in system: {l.extra.join(', ')}</span>}</div>}</td>
                <td className="r num">{fqty(l.p.stock, l.p.unit)}</td>
                <td className="r">{l.p.serial ? <span className="num">{l.counted === null ? '—' : l.counted}</span>
                  : <input className="sc-in" type="number" min="0" step="any" value={d.counts[l.p.id] ?? ''} placeholder={d.zero ? '0' : '—'} aria-label={`Counted ${l.p.name}`}
                    onChange={(e) => setD({ ...d, counts: { ...d.counts, [l.p.id]: e.target.value } })} onWheel={(e) => e.currentTarget.blur()} />}</td>
                <td className="r num">{df === null ? '' : <Badge tone={df === 0 ? 'ok' : df < 0 ? 'bad' : 'info'}>{df === 0 ? '✓' : (df > 0 ? '+' : '') + df}</Badge>}</td>
                {showCost && <td className="r num">{df && !l.p.serial ? money(df * (l.p.cost || 0), false) : ''}</td>}
                <td className="r">{!l.p.serial && <><Btn size="sm" onClick={() => bump(l.p, -1)} disabled={!(Number(d.counts[l.p.id]) > 0)} aria-label={`One less ${l.p.name}`}>−</Btn> <Btn size="sm" onClick={() => bump(l.p)} aria-label={`One more ${l.p.name}`}>+</Btn></>}</td>
              </tr>);
          })}</tbody>
        </table>{shown.length > 400 && <p className="muted">Showing 400 of {shown.length}. Use the tabs or scan to find the rest.</p>}</div>
          : <Empty compact icon="search" title="Nothing here">No products in this list.</Empty>}
      </section>
      {confirmUI}
    </>
  );
}

function History() {
  const q = useApi('stockcount.history', {}, []);
  const [open, setOpen] = useState(null);
  const showCost = useStore((s) => s.can('cost'));
  if (q.loading && !q.data) return <Loading label="Reading past counts" />;
  if (q.error && !q.data) return <ErrorBox error={q.error} onRetry={q.reload} />;
  const rows = q.data || [];
  if (!rows.length) return <Empty icon="receipt" title="No counts yet">Applied stock counts are listed here.</Empty>;
  return (
    <section className="card">
      <div className="dt-scroll"><table className="dc-hist">
        <thead><tr><th>Count</th><th>Name</th><th>Applied</th><th>By</th><th className="r">Counted</th><th className="r">Short</th><th className="r">Over</th><th className="r">Stock fixed</th>{showCost && <th className="r">Value</th>}<th /></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id}><td>{c.no}</td><td>{c.name}</td><td>{fdatetime(c.applied_at)}</td><td>{c.by}</td><td className="r">{c.counted}</td><td className="r">{c.short}</td><td className="r">{c.over}</td><td className="r">{c.adjusted}</td>
          {showCost && <td className="r num">{money(c.value, false)}</td>}<td><Btn size="sm" onClick={() => setOpen(c)}>View</Btn></td></tr>)}</tbody>
      </table></div>
      {open && <CountView c={open} showCost={showCost} onClose={() => setOpen(null)} />}
    </section>
  );
}

function CountView({ c, showCost, onClose }) {
  const cols = [{ key: 'name', label: 'Product' }, { key: 'expected', label: 'System' }, { key: 'counted', label: 'Counted' }, { key: 'difference', label: 'Difference' }, ...(showCost ? [{ key: 'value', label: 'Value', type: 'money' }] : []), { key: 'notes', label: 'Serials' }];
  const rows = c.lines.map((l) => ({ ...l, notes: l.serial ? [l.missing?.length ? `Missing: ${l.missing.join(', ')}` : '', l.extra?.length ? `Not in system: ${l.extra.join(', ')}` : ''].filter(Boolean).join(' · ') || '—' : '' }));
  return (
    <Modal open size="lg" title={`${c.no} — ${c.name}`} onClose={onClose}
      footer={<><Btn onClick={() => printTable(`${c.no} — ${c.name}`, cols, rows, null, `Applied ${fdatetime(c.applied_at)} by ${c.by}`)}>Print</Btn><Btn onClick={onClose}>Close</Btn></>}>
      <p className="muted" style={{ marginTop: 0 }}>Applied {fdatetime(c.applied_at)} by {c.by}. {c.adjusted} products had their stock fixed{showCost ? `, value ${money(c.value)}` : ''}.</p>
      <div className="dt-scroll"><table className="dc-hist">
        <thead><tr><th>Product</th><th className="r">System</th><th className="r">Counted</th><th className="r">Difference</th>{showCost && <th className="r">Value</th>}<th>Serials</th></tr></thead>
        <tbody>{rows.map((l) => <tr key={l.product_id}><td>{l.name}</td><td className="r">{l.expected}</td><td className="r">{l.counted}</td>
          <td className="r"><Badge tone={l.difference === 0 ? 'ok' : l.difference < 0 ? 'bad' : 'info'}>{l.difference === 0 ? '✓' : (l.difference > 0 ? '+' : '') + l.difference}</Badge></td>
          {showCost && <td className="r num">{l.value ? money(l.value, false) : ''}</td>}<td className="muted">{l.notes}</td></tr>)}</tbody>
      </table></div>
    </Modal>
  );
}
