import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Btn, Modal, Field, useAction, Empty } from './ui';

const COLORS = ['yellow', 'blue', 'green', 'pink', 'violet'];
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const plus = (mins) => local(new Date(Date.now() + mins * 60000));
const at = (h, dayShift = 0) => { const d = new Date(); d.setDate(d.getDate() + dayShift); d.setHours(h, 0, 0, 0); return local(d); };
const nice = (s) => { if (!s) return ''; const d = new Date(s); return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }); };
const QUICK = [['In 1 hour', () => plus(60)], ['Tonight 8 PM', () => at(20)], ['Tomorrow 10 AM', () => at(10, 1)], ['Next week', () => at(10, 7)]];

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

function NoteForm({ initial, onSaved, onCancel }) {
  const [text, setText] = useState(initial?.text || '');
  const [when, setWhen] = useState(initial?.remind_at || '');
  const [color, setColor] = useState(initial?.color || 'yellow');
  const [busy, run] = useAction();
  const save = async () => { const r = await run(() => api('note.save', { id: initial?.id, text, remind_at: when, color, status: initial?.status }), initial?.id ? 'Note saved' : 'Note added'); if (r) onSaved(r); };
  return (
    <div className={`note-form nc-${color}`}>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Write a note… e.g. Call Karim about the router payment" aria-label="Note" autoFocus />
      <div className="note-form-row">
        <Field label="Remind me"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Remind me at" /></Field>
        <div className="note-quick">{QUICK.map(([l, f]) => <button key={l} type="button" className="chip" onClick={() => setWhen(f())}>{l}</button>)}{when && <button type="button" className="chip" onClick={() => setWhen('')}>No reminder</button>}</div>
      </div>
      <div className="note-form-row end">
        <div className="note-colors" role="radiogroup" aria-label="Colour">{COLORS.map((c) => <button key={c} type="button" className={`note-dot nc-${c} ${color === c ? 'on' : ''}`} onClick={() => setColor(c)} aria-label={c} />)}</div>
        <span className="spacer" />
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
        <Btn kind="primary" busy={busy} onClick={save} disabled={!text.trim()}>{initial?.id ? 'Save note' : 'Add note'}</Btn>
      </div>
    </div>
  );
}

function NotesPanel({ notes, onClose }) {
  const [editing, setEditing] = useState(null);
  const [busy, run] = useAction();
  const act = async (fn, msg) => { const r = await run(fn, msg); if (r) notes.set(r); };
  const open = notes.list.filter((n) => n.status !== 'done'), done = notes.list.filter((n) => n.status === 'done');
  const row = (n) => editing === n.id ? <NoteForm key={n.id} initial={n} onSaved={(r) => { notes.set(r); setEditing(null); }} onCancel={() => setEditing(null)} /> : (
    <div key={n.id} className={`note-item nc-${n.color || 'yellow'} ${n.status === 'done' ? 'done' : ''}`}>
      <p>{n.text}</p>
      <div className="note-meta">{n.remind_at ? <span className={`note-when ${n.status !== 'done' && n.remind_at <= local(new Date()) ? 'due' : ''}`}>⏰ {nice(n.remind_at)}</span> : <span className="muted">No reminder</span>}
        <span className="spacer" />
        {n.status !== 'done' ? <><Btn size="sm" onClick={() => setEditing(n.id)}>Edit</Btn><Btn size="sm" busy={busy} onClick={() => act(() => api('note.save', { ...n, status: 'done' }), 'Marked done')}>✓ Done</Btn></>
          : <Btn size="sm" busy={busy} onClick={() => act(() => api('note.save', { ...n, status: 'open' }), 'Opened again')}>Open again</Btn>}
        <Btn size="sm" kind="danger" busy={busy} onClick={() => act(() => api('note.delete', { id: n.id }), 'Note deleted')} aria-label="Delete note">Delete</Btn>
      </div>
    </div>
  );
  return (
    <Modal open size="md" title="Notes & reminders" onClose={onClose} footer={<Btn onClick={onClose}>Close</Btn>}>
      <NoteForm key={notes.list.length} onSaved={(r) => notes.set(r)} />
      <div className="note-list">
        {open.length ? open.map(row) : <Empty compact icon="ok" title="No open notes">Notes you write are only seen by you.</Empty>}
        {done.length > 0 && <><h4 className="note-h">Done</h4>{done.map(row)}</>}
      </div>
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
  if (!due.length) return null;
  const save = async (n, patch, msg) => { const r = await run(() => api('note.save', { ...n, ...patch }), msg); if (r) { notes.set(r); setPicking(null); } };
  return (
    <div className="note-pops" role="region" aria-label="Reminders">
      {due.slice(0, 3).map((n) => (
        <div key={n.id} className={`note-pop nc-${n.color || 'yellow'}`} role="alertdialog" aria-label="Reminder">
          <div className="note-pop-head"><b>⏰ Reminder</b><small>{nice(n.remind_at)}</small><button type="button" className="note-x" onClick={() => setHidden({ ...hidden, [n.id]: n.remind_at })} aria-label="Hide for now">×</button></div>
          {editing === n.id ? <NoteForm initial={n} onSaved={(r) => { notes.set(r); setEditing(null); }} onCancel={() => setEditing(null)} /> : <p>{n.text}</p>}
          {picking === n.id && <div className="note-pick"><input type="datetime-local" defaultValue={plus(60)} id={`pick-${n.id}`} aria-label="New reminder date" />
            <Btn size="sm" kind="primary" busy={busy} onClick={() => save(n, { remind_at: document.getElementById(`pick-${n.id}`).value }, 'Reminder moved')}>Set</Btn></div>}
          {editing !== n.id && <div className="note-pop-actions">
            <Btn size="sm" kind="primary" busy={busy} onClick={() => save(n, { status: 'done' }, 'Done')}>✓ Done</Btn>
            <Btn size="sm" busy={busy} onClick={() => save(n, { remind_at: plus(60) }, 'Reminder in 1 hour')}>1 hour later</Btn>
            <Btn size="sm" busy={busy} onClick={() => save(n, { remind_at: at(10, 1) }, 'Reminder tomorrow')}>Tomorrow</Btn>
            <Btn size="sm" onClick={() => setPicking(picking === n.id ? null : n.id)}>New date</Btn>
            <Btn size="sm" onClick={() => setEditing(n.id)}>Edit</Btn>
            <Btn size="sm" busy={busy} onClick={() => save(n, { remind_at: '' }, 'Reminder dismissed — the note stays')}>Dismiss</Btn>
          </div>}
        </div>
      ))}
      {due.length > 3 && <div className="note-more">+{due.length - 3} more — open Notes</div>}
    </div>
  );
}

