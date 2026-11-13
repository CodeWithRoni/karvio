import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Rows visible in an open dropdown before it scrolls. */
export const VISIBLE_ROWS = 10;
const ROW_H = 30;

const usable = (el) => el instanceof HTMLSelectElement && !el.multiple && !el.disabled && !(el.size > 1);
const optionsOf = (sel) => {
  const out = [];
  for (const node of sel.children) {
    if (node.tagName === 'OPTGROUP') {
      out.push({ group: node.label });
      for (const o of node.children) if (o.tagName === 'OPTION' && !o.hidden) out.push({ value: o.value, label: o.label || o.text, disabled: o.disabled || node.disabled, index: o.index });
    } else if (node.tagName === 'OPTION' && !node.hidden) out.push({ value: node.value, label: node.label || node.text, disabled: node.disabled, index: node.index });
  }
  return out;
};
const setValue = (sel, index) => {
  if (sel.selectedIndex === index) return;
  sel.selectedIndex = index;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
};

/**
 * Opens every ordinary <select> (mouse or Space / Alt+↓ / F4) as a list that shows 10 options and scrolls
 * for the rest. The <select> itself stays the source of truth, so React onChange and form code are unchanged.
 * Touch screens keep the phone's own picker.
 */
export default function SelectPopup() {
  const [open, setOpen] = useState(null); // { sel, items, hi, rect }
  const listRef = useRef(null), typed = useRef({ s: '', t: 0 });
  const mouse = useRef({ x: -1, y: -1, moved: false }); // only a real mouse move changes the highlight, not the list scrolling under a still pointer
  const state = useRef(open); state.current = open;

  useEffect(() => {
    if (!window.matchMedia?.('(pointer: fine)').matches) return undefined;
    const show = (sel) => {
      const items = optionsOf(sel);
      if (!items.some((x) => !x.group)) return;
      const hi = Math.max(0, items.findIndex((x) => !x.group && x.index === sel.selectedIndex));
      setOpen({ sel, items, hi, rect: sel.getBoundingClientRect() });
    };
    const onDown = (e) => {
      const cur = state.current;
      if (cur && listRef.current?.contains(e.target)) return;
      if (e.button === 0 && usable(e.target)) {
        e.preventDefault();
        e.target.focus();
        if (cur?.sel === e.target) setOpen(null); else show(e.target);
        return;
      }
      if (cur) setOpen(null);
    };
    const onKey = (e) => {
      const cur = state.current;
      if (!cur) {
        if (usable(e.target) && (e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) { e.preventDefault(); show(e.target); }
        return;
      }
      const { items } = cur;
      const step = (from, d) => { let i = from; for (let n = 0; n < items.length; n++) { i += d; if (i < 0 || i >= items.length) return from; if (!items[i].group && !items[i].disabled) return i; } return from; };
      const move = (hi) => { e.preventDefault(); e.stopPropagation(); setOpen({ ...cur, hi }); };
      if (e.key === 'ArrowDown') return move(step(cur.hi, 1));
      if (e.key === 'ArrowUp') return move(step(cur.hi, -1));
      if (e.key === 'PageDown') { let h = cur.hi; for (let n = 0; n < VISIBLE_ROWS - 1; n++) h = step(h, 1); return move(h); }
      if (e.key === 'PageUp') { let h = cur.hi; for (let n = 0; n < VISIBLE_ROWS - 1; n++) h = step(h, -1); return move(h); }
      if (e.key === 'Home') return move(step(-1, 1));
      if (e.key === 'End') return move(step(items.length, -1));
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        const it = items[cur.hi]; if (it && !it.group && !it.disabled) setValue(cur.sel, it.index);
        setOpen(null); cur.sel.focus(); return;
      }
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } setOpen(null); return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); e.stopPropagation();
        const now = Date.now(), t = typed.current;
        t.s = (now - t.t < 800 ? t.s : '') + e.key.toLowerCase(); t.t = now;
        const found = items.findIndex((x) => !x.group && !x.disabled && String(x.label).toLowerCase().startsWith(t.s));
        if (found >= 0) setOpen({ ...cur, hi: found });
      }
    };
    const onScroll = (e) => { if (state.current && !listRef.current?.contains(e.target)) setOpen(null); };
    const onResize = () => setOpen(null);
    const onMove = (e) => { const m = mouse.current; m.moved = m.x !== e.clientX || m.y !== e.clientY; m.x = e.clientX; m.y = e.clientY; };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Keep the highlighted row in view.
  useLayoutEffect(() => {
    const ul = listRef.current; if (!ul || !open) return;
    const li = ul.children[open.hi]; if (!li) return;
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop - 4;
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight + 4;
  }, [open]);

  if (!open) return null;
  const { rect, items, hi, sel } = open;
  const height = Math.min(items.length, VISIBLE_ROWS) * ROW_H + 8;
  const below = window.innerHeight - rect.bottom - 8, above = rect.top - 8;
  const up = below < height && above > below;
  const style = { left: Math.max(4, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 160) - 4)), minWidth: rect.width, maxHeight: VISIBLE_ROWS * ROW_H + 8 };
  if (up) style.bottom = window.innerHeight - rect.top + 2; else style.top = rect.bottom + 2;
  const pick = (it) => { if (it.group || it.disabled) return; setValue(sel, it.index); setOpen(null); sel.focus(); };
  return createPortal(
    <ul ref={listRef} className="select-pop" role="listbox" aria-label={sel.getAttribute('aria-label') || sel.labels?.[0]?.textContent || 'Options'} style={style}>
      {items.map((it, i) => it.group
        ? <li key={'g' + i} className="grp" role="presentation">{it.group}</li>
        : <li key={i} role="option" aria-selected={it.index === sel.selectedIndex} aria-disabled={it.disabled || undefined}
            className={[i === hi && 'hi', it.index === sel.selectedIndex && 'cur', it.disabled && 'off'].filter(Boolean).join(' ')}
            onMouseMove={() => { if (mouse.current.moved && !it.disabled && i !== hi) setOpen({ ...open, hi: i }); }} onMouseDown={(e) => { e.preventDefault(); pick(it); }}>{it.label}</li>)}
    </ul>, document.body);
}
