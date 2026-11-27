// Each HTML block on its own A4 page(s), downloaded as a PDF.
import { printFonts } from './export';

/** Render each HTML block on its own A4 page(s) and download a PDF. Bengali text renders correctly. */
export async function pdfPages(blocks, styles, filename) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 32;
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'absolute', left: '-10000px', top: '0', width: '760px', background: '#fff' });
  host.innerHTML = `<style>${printFonts}${styles}</style>`;
  document.body.appendChild(host);
  try {
    await document.fonts.load("400 12px 'Hind Siliguri'", 'বাংলা');
    let first = true;
    for (const html of blocks) {
      const el = document.createElement('div'); el.style.padding = '4px'; el.innerHTML = html;
      host.appendChild(el);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
      const bounds = el.getBoundingClientRect(), scale = canvas.width / bounds.width;
      const rows = Array.from(el.querySelectorAll('tr'), (row) => {
        const box = row.getBoundingClientRect();
        return { top: Math.floor((box.top - bounds.top) * scale), bottom: Math.ceil((box.bottom - bounds.top) * scale) };
      });
      el.remove();
      const pw = W - M * 2, sliceH = Math.floor(((H - M * 2) / pw) * canvas.width);
      for (let y = 0; y < canvas.height;) {
        let end = Math.min(y + sliceH, canvas.height);
        if (end < canvas.height) {
          const crossing = rows.find(({ top, bottom }) => top > y && top < end && bottom > end && bottom - top <= sliceH);
          if (crossing) end = crossing.top;
        }
        const c = document.createElement('canvas'); c.width = canvas.width; c.height = end - y;
        c.getContext('2d').drawImage(canvas, 0, y, c.width, c.height, 0, 0, c.width, c.height);
        if (!first) doc.addPage(); first = false;
        doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, pw, (c.height / c.width) * pw); // JPEG: about 10× smaller than PNG, still sharp at scale 2
        y = end;
      }
    }
    doc.save(filename);
  } finally { host.remove(); }
}
