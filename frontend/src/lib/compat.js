// PC builder compatibility, read from each product's name, model, description, group, category and brand.
// Tip for best results: put the socket (AM4, AM5, LGA1700…) or memory type (DDR4, DDR5) in the model or description.

const CHIPSETS = {
  AM4: ['a320', 'b350', 'x370', 'b450', 'x470', 'a520', 'b550', 'x570'],
  AM5: ['a620', 'b650', 'b650e', 'x670', 'x670e', 'b840', 'b850', 'x870', 'x870e'],
  LGA1851: ['h810', 'b860', 'z890'],
  LGA1700: ['h610', 'b660', 'h670', 'z690', 'b760', 'h770', 'z790'],
  LGA1200: ['h410', 'b460', 'h470', 'z490', 'h510', 'b560', 'h570', 'z590'],
  LGA1151: ['h110', 'b150', 'h170', 'z170', 'b250', 'h270', 'z270', 'h310', 'b360', 'b365', 'h370', 'z370', 'z390'],
  LGA1150: ['h81', 'b85', 'h87', 'z87', 'h97', 'z97'],
  LGA1155: ['h61', 'b75', 'h77', 'z77', 'z68', 'p67', 'h67']
};
const VENDOR = (socket) => (socket && socket.startsWith('AM') ? 'amd' : socket ? 'intel' : null);
const SOCKET_DDR = { AM5: 'DDR5', AM4: 'DDR4', LGA1851: 'DDR5', LGA1200: 'DDR4', LGA1151: 'DDR4', LGA1150: 'DDR3', LGA1155: 'DDR3' }; // LGA1700 boards come in DDR4 or DDR5

export function textOf(p, catName = {}, brandName = {}) {
  return ` ${[p.name, p.sku, p.description, catName[p.category_id], catName[p.subcategory_id], brandName[p.brand_id]].filter(Boolean).join(' ')} `.toLowerCase();
}
function explicitSocket(t) {
  const m = t.match(/\b(am5|am4|lga\s?-?(1851|1700|1200|1151|1150|1155))\b/);
  if (!m) return null;
  return m[1].startsWith('am') ? m[1].toUpperCase() : `LGA${m[2]}`;
}
function ddrOf(t) {
  const m = t.match(/\bddr\s?([345])\b/) || t.match(/[\s\-/(]d([45])\b/);
  return m ? `DDR${m[1]}` : null;
}

export function cpuInfo(t) {
  let socket = explicitSocket(t), m;
  if (!socket) {
    if ((m = t.match(/ryzen\s*(?:\d\s*)?(\d)\d{3}/))) socket = Number(m[1]) >= 7 ? 'AM5' : 'AM4';
    else if (/athlon\s*(3000g|200ge|220ge|240ge|300ge|320ge)/.test(t)) socket = 'AM4';
    else if (/core\s*ultra\s*\d\s*2\d\d/.test(t)) socket = 'LGA1851';
    else if ((m = t.match(/\bi[3579]\s*-?\s*(\d{4,5})/))) {
      const n = m[1], g = n.length === 5 ? Number(n.slice(0, 2)) : Number(n[0]);
      socket = g >= 12 ? 'LGA1700' : g >= 10 ? 'LGA1200' : g >= 6 ? 'LGA1151' : g === 4 ? 'LGA1150' : g >= 2 ? 'LGA1155' : null;
    } else if (/\b(pentium|celeron)\b.*\bg7\d{3}|\bg6900\b/.test(t)) socket = 'LGA1700';
    else if (/\bg6[45]\d{2}|\bg59\d{2}/.test(t)) socket = 'LGA1200';
  }
  const vendor = VENDOR(socket) || (/\b(amd|ryzen|athlon)\b/.test(t) ? 'amd' : /\b(intel|core\s*i\d|core\s*ultra|pentium|celeron)\b/.test(t) ? 'intel' : null);
  return { socket, vendor };
}

export function boardInfo(t) {
  let socket = explicitSocket(t);
  if (!socket) {
    for (const [s, list] of Object.entries(CHIPSETS)) {
      if (list.some((c) => new RegExp(`(^|[^a-z0-9])${c}(m|e|i)?([^a-z0-9]|$)`).test(t))) { socket = s; break; }
    }
  }
  const vendor = VENDOR(socket) || (/\bamd\b/.test(t) ? 'amd' : /\bintel\b/.test(t) ? 'intel' : null);
  return { socket, vendor, ddr: ddrOf(t) || SOCKET_DDR[socket] || null };
}

export const ramInfo = (t) => ({ ddr: ddrOf(t) });

/** 'ok' | 'no' | 'unknown' */
export function boardFitsCpu(board, cpu) {
  if (!cpu || (!cpu.socket && !cpu.vendor)) return 'ok';
  if (cpu.socket && board.socket) return cpu.socket === board.socket ? 'ok' : 'no';
  if (cpu.vendor && board.vendor) return cpu.vendor === board.vendor ? 'ok' : 'no';
  return 'unknown';
}
export function ramFits(ram, wantDdr) {
  if (!wantDdr) return 'ok';
  if (!ram.ddr) return 'unknown';
  return ram.ddr === wantDdr ? 'ok' : 'no';
}
