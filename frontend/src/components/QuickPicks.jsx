import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { money, qty as fqty } from '../lib/format';
import { Tabs } from './ui';

// "Quick add" on an empty POS cart: best sellers (from the server), and this browser's recent and favourite products.
const RECENT_KEY = 'karvio_pos_recent', FAV_KEY = 'karvio_pos_favourites', TAB_KEY = 'karvio_pos_picks_tab';
const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

/** Call when a product goes into the cart: it moves to the front of "Recent". */
export function rememberRecent(id) { write(RECENT_KEY, [id, ...read(RECENT_KEY).filter((x) => x !== id)].slice(0, 12)); }

export default function QuickPicks({ products, priceFor, onPick, hover }) {
  const [tab, setTabState] = useState(() => { try { return localStorage.getItem(TAB_KEY) || 'best'; } catch { return 'best'; } });
  const [best, setBest] = useState(null);
  const [favs, setFavs] = useState(() => read(FAV_KEY));
  const setTab = (v) => { setTabState(v); try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } };
  useEffect(() => {
    let live = true;
    api('pos.picks').then((r) => live && setBest(r.map((x) => x.product_id))).catch(() => live && setBest([]));
    return () => { live = false; };
  }, []);
  const pmap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const ids = tab === 'best' ? best || [] : tab === 'recent' ? read(RECENT_KEY) : favs;
  const list = ids.map((id) => pmap[id]).filter((p) => p && p.active !== false).slice(0, 12);
  const toggleFav = (id) => setFavs((f) => { const next = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f].slice(0, 24); write(FAV_KEY, next); return next; });
  const emptyText = tab === 'best' ? (best === null ? 'Loading best sellers…' : 'Best sellers appear here after a few sales.')
    : tab === 'recent' ? 'Products you add to a sale on this computer appear here.' : 'Tap the star on any product to keep it here.';

  return (
    <div className="quick-picks" aria-label="Quick add">
      <div className="qp-head"><b>Quick add</b><Tabs tabs={[['best', 'Best sellers'], ['recent', 'Recent'], ['fav', 'Favourites']]} value={tab} onChange={setTab} /></div>
      {list.length ? (
        <div className="qp-grid">
          {list.map((p) => {
            const stock = p.available ?? p.stock, out = !p.service && stock <= 0, fav = favs.includes(p.id);
            const tile = (
              <div className={`qp-tile ${out ? 'out' : ''}`} key={p.id}>
                <button type="button" className="qp-add" onClick={() => onPick(p)} aria-label={`Add ${p.name}`} title={`Add ${p.name}`}>
                  <b>{p.name}</b>
                  <span className="qp-meta"><span>{p.service ? 'Service' : out ? 'Out of stock' : `${fqty(stock, p.unit)} in stock`}</span><strong className={priceFor(p) === '' ? 'qp-noprice' : ''}>{priceFor(p) === '' ? 'Price Not Set' : money(priceFor(p), false)}</strong></span>
                </button>
                <button type="button" className={`qp-star ${fav ? 'on' : ''}`} onClick={() => toggleFav(p.id)} aria-pressed={fav} aria-label={fav ? `Remove ${p.name} from favourites` : `Add ${p.name} to favourites`} title={fav ? 'Remove from favourites' : 'Add to favourites'}>★</button>
              </div>
            );
            return hover ? <Fragment key={p.id}>{hover(p, tile, { as: 'div', className: 'qp-hover-in' })}</Fragment> : tile;
          })}
        </div>
      ) : <p className="qp-empty">{emptyText}</p>}
      <p className="qp-hint">Scan a barcode or search above — or tap a product to add it. Cables sold by the meter accept decimal quantities.</p>
    </div>
  );
}
