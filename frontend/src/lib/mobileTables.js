/**
 * Phones show data tables as cards ("label … value" lines, see styles.css). DataTable cells carry their own
 * data-label; for the hand-made tables this fills data-label from the column heading, and keeps doing so as
 * pages and dialogs change. Cheap: only cells without a label are touched, a few times a second at most.
 */
const PHONE = '(max-width: 640px)';

function headings(table) {
  const row = table.tHead && table.tHead.rows[0];
  if (!row) return null;
  const out = [];
  for (const th of row.cells) {
    const text = (th.innerText || th.textContent || '').replace(/[▲▼]/g, '').trim();
    for (let k = 0; k < (th.colSpan || 1); k++) out.push(text);
  }
  return out;
}

export function labelTables(root = document) {
  root.querySelectorAll('.dt table').forEach((table) => {
    const heads = headings(table);
    if (!heads) return;
    for (const body of table.tBodies) {
      for (const tr of body.rows) {
        let col = 0;
        for (const td of tr.cells) {
          if (!td.hasAttribute('data-label') && heads[col]) td.setAttribute('data-label', heads[col]);
          col += td.colSpan || 1;
        }
      }
    }
  });
}

export function startMobileTables() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mq = window.matchMedia(PHONE);
  let queued = false;
  const run = () => { queued = false; if (mq.matches) labelTables(); };
  const later = () => { if (!queued) { queued = true; setTimeout(run, 120); } };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  mq.addEventListener?.('change', later);
  later();
}
