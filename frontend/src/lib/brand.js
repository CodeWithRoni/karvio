// The shop's name, address and logo, remembered on this device after a sign-in so the sign-in screen can show them.
const key = (url) => `karvio_brand:${String(url || '').replace(/[?#].*$/, '')}`;
export function saveBrand(url, s = {}) {
  if (!url) return;
  const b = { name: s.shop_name || '', address: s.shop_address || '', phone: s.shop_phone || s.shop_tel || '', logo: /^data:image\//.test(s.shop_logo || '') ? s.shop_logo : '' };
  try { const v = JSON.stringify(b); if (localStorage.getItem(key(url)) !== v) localStorage.setItem(key(url), v); } catch { /* storage full or private mode */ }
}
export function readBrand(url) {
  try { const b = JSON.parse(localStorage.getItem(key(url)) || 'null'); return b && b.name ? b : null; } catch { return null; }
}
