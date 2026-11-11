// Shared outline icon family. Native SVG stays sharp in web, desktop and mobile.
const shapes = {
  Search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  'Daily Work': <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/></>,
  Stock: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8m-9 5v9M7.5 5.5l9 5"/></>,
  'Money & Reports': <><path d="M3 3v18h18M7 16v-4m5 4V8m5 8V5"/><path d="m6 8 5-4 5 1 5-3"/></>,
  Admin: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  '/history': <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M10 7v3l2 1"/></>,
  '/': <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></>,
  '/pos': <><rect x="3" y="3" width="18" height="12" rx="2"/><path d="M8 21h8m-4-6v6M7 7h6m-6 4h3m7-3v3m-1.5-1.5h3"/></>,
  '/sales': <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 4h6m-6 4h4m-4 4h2"/><path d="m14 14 3 2-3 2"/></>,
  '/pc-builder': <><rect x="2" y="4" width="14" height="12" rx="2"/><path d="M5 21h8m-4-5v5"/><rect x="19" y="3" width="3" height="18" rx="1"/><path d="M20 7h1m-1 10h1"/></>,
  '/customers': <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 2 4v2"/></>,
  '/repairs': <><path d="M14 4a6 6 0 0 0-7 7l-4 6a2.5 2.5 0 0 0 4 4l6-5a6 6 0 0 0 7-7l-4 3-4-4 2-4Z"/></>,
  '/service': <><path d="M4 13v-2a8 8 0 0 1 16 0v2m0 5v1a3 3 0 0 1-3 3h-4"/><rect x="2" y="11" width="5" height="8" rx="2"/><rect x="17" y="11" width="5" height="8" rx="2"/><path d="M10 22h3"/></>,
  '/stock': <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8m-9 5v9M7.5 5.5l9 5"/></>,
  '/barcodes': <><path d="M3 7V3h4m10 0h4v4M3 17v4h4m10 0h4v-4M6 7v10m3-10v10m3-10v10m3-10v10m3-10v10"/></>,
  '/prices': <><path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7.5" cy="7.5" r="1"/><path d="m12 11 4 4m-4 0 4-4"/></>,
  '/purchases': <><path d="M2 3h3l3 13h11l3-9H6m3 13h.01M18 20h.01M13 3v8m-3-3 3 3 3-3"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
  '/suppliers': <><path d="M2 5h12v12H2V5Zm12 4h4l4 4v4h-8"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/></>,
  '/warranty': <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  '/accounts': <><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V6a2 2 0 0 1 2-2l12-2v3m-2 7h6v5h-6a2.5 2.5 0 0 1 0-5Z"/><path d="M17 14.5h.01"/></>,
  '/profit': <><path d="M3 4v17h18M6 15l5-5 4 3 6-8m-6 0h6v6"/></>,
  '/expenses': <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 4h6m-6 4h6m-6 4h6"/></>,
  '/reports': <><path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 17v-3m4 3v-6m4 6v-4"/></>,
  '/users': <><circle cx="9" cy="7" r="3"/><path d="M2 20v-2a7 7 0 0 1 11-5m4-2 4 2v3c0 3-4 5-4 5s-4-2-4-5v-3l4-2Z"/><path d="m15 16 1.5 1.5L19 15"/></>,
  '/settings': <><path d="M4 3v4m0 4v10m8-18v10m0 4v4m8-18v4m0 4v10"/><rect x="1" y="7" width="6" height="4" rx="1"/><rect x="9" y="13" width="6" height="4" rx="1"/><rect x="17" y="7" width="6" height="4" rx="1"/></>
};

export default function NavIcon({name,group=false}) {
  return <svg className={group?'nav-section-icon':'nav-item-icon'} width={group?15:18} height={group?15:18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]}</svg>;
}
