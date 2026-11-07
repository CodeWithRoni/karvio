// Product pictures for the online shop: add (several at once), make main, move, remove.
// Every change is saved straight away; pictures are stored in Google Drive › Karvio Shop › Images.
import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { imageUrl, imageList, shrinkImage } from '../lib/images';

const MAX = 6;

export default function ProductPictures({ product, onChange }) {
  const toast = useStore((s) => s.toast);
  const [images, setImages] = useState(() => imageList(product.images));
  const [busy, setBusy] = useState('');
  const input = useRef();

  const done = (p) => { const list = imageList(p.images); setImages(list); onChange?.(list); };
  const add = async (files) => {
    const picked = Array.from(files || []).slice(0, MAX - images.length);
    if (!picked.length) return;
    try {
      for (let i = 0; i < picked.length; i++) {
        setBusy(`Uploading ${i + 1} of ${picked.length}…`);
        const data = await shrinkImage(picked[i]);
        done(await api('product.image.add', { id: product.id, data }));
      }
      toast(picked.length > 1 ? `${picked.length} pictures added` : 'Picture added');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); if (input.current) input.current.value = ''; }
  };
  const save = async (next, msg) => {
    setBusy('Saving…');
    try { done(await api('product.images', { id: product.id, images: next })); if (msg) toast(msg); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  const move = (i, d) => { const n = [...images]; [n[i], n[i + d]] = [n[i + d], n[i]]; save(n); };
  const remove = (i) => { if (confirm('Remove this picture? It goes to the bin in Google Drive.')) save(images.filter((_, j) => j !== i), 'Picture removed'); };

  return (
    <div className="pics">
      <div className="pics-grid">
        {images.map((id, i) => (
          <figure key={id} className={i === 0 ? 'main' : ''}>
            <img src={imageUrl(id, 300)} alt={`${product.name} — picture ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" />
            {i === 0 && <span className="pics-main">Main</span>}
            <div className="pics-tools">
              {i > 0 && <button type="button" onClick={() => save([id, ...images.filter((x) => x !== id)], 'Main picture changed')} disabled={!!busy} title="Make main picture" aria-label={`Make picture ${i + 1} the main picture`}>★</button>}
              {i > 0 && <button type="button" onClick={() => move(i, -1)} disabled={!!busy} aria-label={`Move picture ${i + 1} left`}>‹</button>}
              {i < images.length - 1 && <button type="button" onClick={() => move(i, 1)} disabled={!!busy} aria-label={`Move picture ${i + 1} right`}>›</button>}
              <button type="button" className="bad" onClick={() => remove(i)} disabled={!!busy} aria-label={`Remove picture ${i + 1}`}>✕</button>
            </div>
          </figure>
        ))}
        {images.length < MAX && (
          <label className={`pics-add ${busy ? 'busy' : ''}`}>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={(e) => add(e.target.files)} aria-label="Add pictures" />
            <b>{busy || '+ Add pictures'}</b>
            {!busy && <small>JPG / PNG · up to {MAX - images.length} more</small>}
          </label>
        )}
      </div>
      {busy && images.length >= MAX && <small className="muted">{busy}</small>}
    </div>
  );
}
