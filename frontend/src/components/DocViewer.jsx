// A full document on screen — sale invoice (exactly as the POS prints it), purchase invoice, sales return,
// purchase return or warranty claim — with a Print button. Used by Advance Search.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { printHtml, printFonts } from '../lib/export';
import { invoiceHtml } from '../lib/receipt';
import { claimDocHtml, salesReturnDocHtml } from '../lib/salesDocs';
import { purchaseDocHtml, purchaseReturnDocHtml } from '../lib/purchaseDocs';
import { Modal, Btn, Loading, ErrorBox } from './ui';

export const DOC_TITLE = { sale: 'Sale invoice', purchase: 'Purchase invoice', sreturn: 'Sales return', preturn: 'Purchase return', claim: 'Warranty claim' };
/** The permission needed to open each kind of document (the server checks it again). */
export const DOC_PERM = { sale: 'pos', purchase: 'purchase', sreturn: 'sales.return', preturn: 'purchase', claim: 'warranty' };

async function build(type, d) {
  if (type === 'sale') return invoiceHtml(d); // template and paper from Settings → Invoice, like the POS
  if (type === 'purchase') return { html: purchaseDocHtml(d), paper: 'a4' };
  if (type === 'sreturn') return { html: salesReturnDocHtml(d), paper: 'a4' };
  if (type === 'preturn') return { html: purchaseReturnDocHtml(d), paper: 'a4' };
  return { html: claimDocHtml(d), paper: 'a4' };
}
// on screen the document sits on a grey desk as a white page (printing uses the plain document)
const desk = (paper) => {
  // a page keeps its real paper width (the printable area plus the margins); a narrow window shrinks the whole page
  const sheet = paper === 'a5' ? 'width:148mm!important;padding:8mm!important' : 'width:210mm!important;padding:12mm!important';
  return `html{background:#dfe5ec}body{background:#fff!important;margin:14px auto!important;box-shadow:0 2px 12px rgba(0,0,0,.28)}
    ${paper === 'receipt' ? '' : `body{${sheet};box-sizing:border-box}`}`;
};

export default function DocViewer({ doc, onClose }) {
  const [state, setState] = useState({ loading: true });
  const frame = useRef();
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    api('history.doc', { type: doc.type, id: doc.id })
      .then((r) => build(doc.type, r.detail))
      .then((out) => { if (live) setState(out); }, (e) => { if (live) setState({ error: e.message }); });
    return () => { live = false; };
  }, [doc.type, doc.id]);

  // fit the page to the window width (phones): shrink, never enlarge
  const fit = () => {
    const f = frame.current, d = f?.contentDocument;
    if (!d?.body) return;
    d.documentElement.style.zoom = '';
    const need = d.body.getBoundingClientRect().width + 28, have = f.clientWidth;
    if (need > have) d.documentElement.style.zoom = String(have / need);
  };
  const onLoad = () => { fit(); frame.current?.contentDocument?.fonts?.ready.then(fit).catch(() => {}); };
  useEffect(() => { window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);

  const srcDoc = state.html ? `<!doctype html><html><head><meta charset="utf-8"><style>${printFonts}</style></head><body>${state.html}<style>${desk(state.paper)}</style></body></html>` : '';
  return (
    <Modal open title={`${DOC_TITLE[doc.type] || 'Document'} ${doc.no || ''}`} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" disabled={!state.html} onClick={() => printHtml(state.html)}>Print</Btn></>}>
      {state.loading && <Loading label="Opening" />}
      <ErrorBox error={state.error} />
      {state.html && <iframe ref={frame} className="doc-frame" title={`${DOC_TITLE[doc.type]} ${doc.no || ''}`} srcDoc={srcDoc} sandbox="allow-same-origin" onLoad={onLoad} />}
    </Modal>
  );
}
