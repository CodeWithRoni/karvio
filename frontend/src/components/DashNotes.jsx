import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { shopDay } from '../lib/store';
import { fdate } from '../lib/format';
import { Btn, Modal, useAction, useConfirm, Empty } from './ui';
import DateInput from './DateInput';

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const plus = (mins) => local(new Date(Date.now() + mins * 60000));
const at = (h, dayShift = 0) => { const d = new Date(); d.setDate(d.getDate() + dayShift); d.setHours(h, 0, 0, 0); return local(d); };
const nice = (s) => { if (!s) return ''; const d = new Date(s); return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }); };
const QUICK = [['In 1 hour', () => plus(60)], ['Tonight 8 PM', () => at(20)], ['Tomorrow 10 AM', () => at(10, 1)], ['Next week', () => at(10, 7)]];
const PRIORITY = [['normal', 'Normal'], ['important', 'Important'], ['urgent', 'Urgent']];
const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

/** Only simple formatting survives: bold, italic, underline, strike, heading, lists, quote and web / mail links. */
const KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'BR', 'P', 'DIV']);
export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const walk = (node) => {
    [...node.childNodes].forEach((c) => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1) return c.remove();
      walk(c);
      if (!KEEP.has(c.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'TEMPLATE'].includes(c.tagName)) return c.remove();
        c.replaceWith(...c.childNodes); return;
      }
      const href = c.tagName === 'A' ? (c.getAttribute('href') || '').trim() : '';
      [...c.attributes].forEach((a) => c.removeAttribute(a.name));
      if (c.tagName === 'A' && /^(https?:|mailto:|tel:)/i.test(href)) { c.setAttribute('href', href); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
    });
  };
  const root = doc.body.firstChild; walk(root);
  return root.innerHTML;
}
const bodyOf = (n) => (n.body !== undefined && n.body !== '' ? n.body : esc(n.text));
const plain = (n) => n.text || '';

/** Notes with reminders: the button for the dashboard header, its panel, and the reminder pop-ups. */
export function useNotes() {
  const [list, setList] = useState(null);
  const load = async () => { try { setList(await api('notes.list')); } catch { /* the dashboard still works without notes */ } };
  useEffect(() => { load(); }, []);
  return { list: list || [], set: setList, load };
}

export function NotesButton({ notes }) {
  const [open, setOpen] = useState(false);
  const due = notes.list.filter((n) => n.status !== 'done' && n.remind_at && n.remind_at <= local(new Date())).length;
  const count = notes.list.filter((n) => n.status !== 'done').length;
  return (
    <>
      <button type="button" className="btn note-btn" onClick={() => setOpen(true)} title="Notes and reminders">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v4h4M8.5 12h7m-7 4h4.5" /></svg>
        Notes{count ? <span className={`note-count ${due ? 'due' : ''}`}>{count}</span> : null}
      </button>
      {open && <NotesPanel notes={notes} onClose={() => setOpen(false)} />}
    </>
  );
}

const I = (d) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const TOOLS = [
  ['bold', 'Bold', <b key="b">B</b>], ['italic', 'Italic', <i key="i">I</i>], ['underline', 'Underline', <u key="u">U</u>], ['strikeThrough', 'Strikethrough', <s key="s">S</s>], null,
  ['h3', 'Heading', <b key="h">H</b>],
  ['insertUnorderedList', 'Bullet list', I(<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>)],
  ['insertOrderedList', 'Numbered list', I(<><path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 13.5c0-1 2.5-1 2.5.3 0 1-2.5 2-2.5 3.2H6M3.5 20h2.5" /></>)],
  ['quote', 'Quote', I(<><path d="M7 7H4v5h3l-1 5M17 7h-3v5h3l-1 5" /></>)],
  ['link', 'Link', I(<><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" /></>)], null,
  ['removeFormat', 'Clear formatting', I(<><path d="M4 7V5h12v2M10 5l-3 14M14 14l6 6M20 14l-6 6" /></>)],
  ['undo', 'Undo', I(<><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>)],
  ['redo', 'Redo', I(<><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></>)]
];

/** New / edit note: title, a small formatted editor, date, status, priority and an optional reminder pop-up. */
export function NoteEditor({ initial, onSaved, onClose }) {
  const editing = !!initial?.id;
  const [title, setTitle] = useState(initial?.title || '');
  const [date, setDate] = useState(initial?.date || shopDay());
  const [status, setStatus] = useState(initial?.status === 'done' ? 'done' : 'open');
  const [priority, setPriority] = useState(initial?.priority || 'normal');
  const [remind, setRemind] = useState(!!initial?.remind_at);
  const [when, setWhen] = useState(initial?.remind_at || plus(60));
  const [linking, setLinking] = useState(null);
  const [empty, setEmpty] = useState(!plain(initial || {}).trim());
  const ed = useRef(null), box = useRef(null), saveRef = useRef(null);
  const [busy, run] = useAction();
  useEffect(() => { if (ed.current) ed.current.innerHTML = initial ? cleanHtml(bodyOf(initial)) : ''; }, []);
  useEffect(() => {
    // Esc closes only this editor (not the notes list behind it); Ctrl + Enter saves.
    const h = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveRef.current?.(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);
  const cmd = (c) => {
    ed.current?.focus();
    if (c === 'h3') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock').toLowerCase() === 'h3' ? 'div' : 'h3');
    else if (c === 'quote') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock').toLowerCase() === 'blockquote' ? 'div' : 'blockquote');
    else if (c === 'link') { const sel = window.getSelection(); setLinking({ range: sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null, url: 'https://' }); return; }
    else document.execCommand(c, false, null);
    setEmpty(!ed.current.innerText.trim());
  };
  const addLink = () => {
    const url = linking.url.trim();
    if (/^(https?:\/\/.+|mailto:.+|tel:.+)$/i.test(url)) {
      ed.current.focus(); const sel = window.getSelection();
      if (linking.range) { sel.removeAllRanges(); sel.addRange(linking.range); }
      if (sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${esc(url)}</a>`);
      else document.execCommand('createLink', false, url);
      setEmpty(false);
    }
    setLinking(null);
  };
  const html = () => cleanHtml(ed.current?.innerHTML || '');
  const can = title.trim() || !empty;
  const save = async () => {
    if (!can) return;
    const r = await run(() => api('note.save', { id: initial?.id, title, body: html(), date, status, priority, color: initial?.color, remind_at: remind ? when : '' }), editing ? 'Note saved' : 'Note added');
    if (r) onSaved(r);
  };
  saveRef.current = save;
  return (
    <div className="modal-bg ne-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ne" ref={box} role="dialog" aria-modal="true" aria-label={editing ? 'Edit note' : 'New note'}>
        <div className="ne-head">
          <span className="ne-ico">{I(<><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v4h4M8.5 12h7m-7 4h4.5" /></>)}</span>
          <div><h2>{editing ? 'Edit note' : 'New note'}</h2><small>Write it down and set a reminder if needed</small></div>
          <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="ne-body">
          <input className="ne-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Title — e.g. Call supplier about delivery" aria-label="Note title" autoFocus />
          <div className="ne-editor">
            <div className="ne-tools" role="toolbar" aria-label="Formatting">
              {TOOLS.map((t, i) => t ? <button key={t[0]} type="button" title={t[1]} aria-label={t[1]} onMouseDown={(e) => { e.preventDefault(); cmd(t[0]); }}>{t[2]}</button> : <span key={'sep' + i} className="ne-sep" />)}
            </div>
            {linking && <div className="ne-link"><input value={linking.url} onChange={(e) => setLinking({ ...linking, url: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} aria-label="Link address" autoFocus /><Btn size="sm" kind="primary" onClick={addLink}>Add link</Btn><Btn size="sm" onClick={() => setLinking(null)}>Cancel</Btn></div>}
            <div ref={ed} className={`ne-area ${empty ? 'empty' : ''}`} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Note" data-ph="Write your note…"
              onInput={() => setEmpty(!ed.current.innerText.trim())}
              onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }} />
          </div>
          <div className="ne-row">
            <label className="ne-f"><span>Date</span><DateInput value={date} onChange={(e) => setDate(e.target.value)} aria-label="Note date" /></label>
            <div className="ne-f"><span>Status</span><div className="ne-pills" role="radiogroup" aria-label="Status">
              {[['open', 'Open'], ['done', 'Closed']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={status === v} className={`ne-pill st-${v} ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}><i />{l}</button>)}
            </div></div>
            <div className="ne-f"><span>Priority</span><div className="ne-pills" role="radiogroup" aria-label="Priority">
              {PRIORITY.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={priority === v} className={`ne-pill pr-${v} ${priority === v ? 'on' : ''}`} onClick={() => setPriority(v)}><i />{l}</button>)}
            </div></div>
          </div>
          <div className={`ne-remind ${remind ? 'on' : ''}`}>
            <span className="ne-bell">{I(<><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 003.4 0" /></>)}</span>
            <div className="ne-remind-t"><b>Reminder</b><small>{remind ? `On — a popup at ${nice(when)}` : 'Off — turn on to get a popup at the time you choose'}</small></div>
            <label className="tgl" title={remind ? 'On' : 'Off'}><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} aria-label="Reminder on" /><span /></label>
            {remind && <div className="ne-remind-pick">
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Remind me at" />
              <div className="note-quick">{QUICK.map(([l, f]) => <button key={l} type="button" className="chip" onClick={() => setWhen(f())}>{l}</button>)}</div>
            </div>}
          </div>
        </div>
        <div className="ne-foot">
          <span className="ne-keys"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to close</span>
          <span className="spacer" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" className="ne-save" busy={busy} disabled={!can || (remind && !when)} onClick={save}>✓ Save note</Btn>
        </div>
      </div>
    </div>
  );
}

function NoteCard({ n, busy, onEdit, onToggle, onDelete }) {
  const due = n.status !== 'done' && n.remind_at && n.remind_at <= local(new Date());
  const pr = n.priority || 'normal';
  return (
    <div className={`note-item pr-${pr} ${n.status === 'done' ? 'done' : ''}`}>
      <div className="note-top">
        <b className="note-title">{n.title || plain(n).split('\n')[0] || 'Note'}</b>
        {pr !== 'normal' && <span className={`note-pr pr-${pr}`}>{pr === 'urgent' ? 'Urgent' : 'Important'}</span>}
        <span className="spacer" />
        <small className="muted">{fdate(n.date || String(n.created_at || '').slice(0, 10))}</small>
      </div>
      <div className="note-body" dangerouslySetInnerHTML={{ __html: cleanHtml(bodyOf(n)) }} />
      <div className="note-meta">{n.remind_at ? <span className={`note-when ${due ? 'due' : ''}`}>⏰ {nice(n.remind_at)}</span> : <span className="muted">No reminder</span>}
        <span className="spacer" />
        <Btn size="sm" onClick={onEdit}>✎ Edit</Btn>
        <Btn size="sm" busy={busy} onClick={onToggle}>{n.status === 'done' ? 'Open again' : '✓ Close'}</Btn>
        <Btn size="sm" kind="danger" busy={busy} onClick={onDelete} aria-label="Delete note">Delete</Btn>
      </div>
    </div>
  );
}

function NotesPanel({ notes, onClose }) {
  const [editing, setEditing] = useState(null); // null, 'new' or a note
  const [busy, run] = useAction();
  const [confirmUI, ask] = useConfirm();
  const act = async (fn, msg) => { const r = await run(fn, msg); if (r) notes.set(r); };
  const open = notes.list.filter((n) => n.status !== 'done'), done = notes.list.filter((n) => n.status === 'done');
  const remove = async (n) => { if (await ask({ title: 'Delete note?', message: `Delete "${n.title || plain(n).slice(0, 60) || 'this note'}"? This cannot be undone.`, confirmLabel: 'Delete' })) act(() => api('note.delete', { id: n.id }), 'Note deleted'); };
  const card = (n) => <NoteCard key={n.id} n={n} busy={busy} onEdit={() => setEditing(n)} onDelete={() => remove(n)}
    onToggle={() => act(() => api('note.save', { ...n, body: n.body !== undefined ? n.body : undefined, status: n.status === 'done' ? 'open' : 'done' }), n.status === 'done' ? 'Opened again' : 'Note closed')} />;
  return (
    <Modal open size="md" title="Notes & reminders" onClose={onClose} footer={<><span className="muted note-only">Only you see your notes.</span><span className="spacer" /><Btn onClick={onClose}>Close</Btn></>}>
      <div className="note-bar"><b>{open.length} open</b>{done.length ? <span className="muted"> · {done.length} closed</span> : null}<span className="spacer" /><Btn kind="primary" onClick={() => setEditing('new')}>+ New note</Btn></div>
      <div className="note-list">
        {open.length ? open.map(card) : <Empty compact icon="ok" title="No open notes">Press New note to write one. Notes you write are only seen by you.</Empty>}
        {done.length > 0 && <><h4 className="note-h">Closed</h4>{done.map(card)}</>}
      </div>
      {editing && <NoteEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(r) => { notes.set(r); setEditing(null); }} />}
      {confirmUI}
    </Modal>
  );
}

/** Reminders that are due pop up on the dashboard; checked every 30 seconds. */
export function NoteReminders({ notes }) {
  const [now, setNow] = useState(() => local(new Date()));
  const [hidden, setHidden] = useState({});
  const [picking, setPicking] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, run] = useAction();
  useEffect(() => { const t = setInterval(() => setNow(local(new Date())), 30000); return () => clearInterval(t); }, []);
  const due = useMemo(() => notes.list.filter((n) => n.status !== 'done' && n.remind_at && n.remind_at <= now && hidden[n.id] !== n.remind_at), [notes.list, now, hidden]);
  const save = async (n, patch, msg) => { const r = await run(() => api('note.save', { ...n, ...patch }), msg); if (r) { notes.set(r); setPicking(null); } };
  if (!due.length && !editing) return null;
  return (
    <div className="note-pops" role="region" aria-label="Reminders">
      {due.slice(0, 3).map((n) => (
        <div key={n.id} className={`note-pop pr-${n.priority || 'normal'}`} role="alertdialog" aria-label="Reminder">
          <div className="note-pop-head"><b>⏰ Reminder</b><small>{nice(n.remind_at)}</small><button type="button" className="note-x" onClick={() => setHidden({ ...hidden, [n.id]: n.remind_at })} aria-label="Hide for now">×</button></div>
          {n.title && <b className="note-pop-title">{n.title}</b>}
          <div className="note-body" dangerouslySetInnerHTML={{ __html: cleanHtml(bodyOf(n)) }} />
          {picking === n.id && <div className="note-pick"><input type="datetime-local" defaultValue={plus(60)} id={`pick-${n.id}`} aria-label="New reminder date" />
            <Btn size="sm" kind="primary" busy={busy} onClick={() => save(n, { remind_at: document.getElementById(`pick-${n.id}`).value }, 'Reminder moved')}>Set</Btn></div>}
          <div className="note-pop-actions">
            <Btn size="sm" kind="primary" busy={busy} onClick={() => save(n, { status: 'done' }, 'Done')}>✓ Done</Btn>
            <Btn size="sm" busy={busy} onClick={() => save(n, { remind_at: plus(60) }, 'Reminder in 1 hour')}>1 hour later</Btn>
            <Btn size="sm" busy={busy} onClick={() => save(n, { remind_at: at(10, 1) }, 'Reminder tomorrow')}>Tomorrow</Btn>
            <Btn size="sm" onClick={() => setPicking(picking === n.id ? null : n.id)}>New date</Btn>
            <Btn size="sm" onClick={() => setEditing(n)}>Edit</Btn>
            <Btn size="sm" busy={busy} onClick={() => save(n, { remind_at: '' }, 'Reminder dismissed — the note stays')}>Dismiss</Btn>
          </div>
        </div>
      ))}
      {due.length > 3 && <div className="note-more">+{due.length - 3} more — open Notes</div>}
      {editing && <NoteEditor initial={editing} onClose={() => setEditing(null)} onSaved={(r) => { notes.set(r); setEditing(null); }} />}
    </div>
  );
}
