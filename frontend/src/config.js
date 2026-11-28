// Apps for shops on the Karvio server (desktop and mobile builds with VITE_SHOP_DOMAIN, e.g. karvio.com.bd):
// the first screen asks for the shop's address (computerplus → https://computerplus.karvio.com.bd/api).
export const SHOP_DOMAIN = (import.meta.env.VITE_SHOP_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
export const shopApiUrl = (shop) => `https://${shop}.${SHOP_DOMAIN}/api`;
/** The shop name in a saved address on SHOP_DOMAIN ("computerplus"), or ''. */
export const shopOf = (url) => {
  if (!SHOP_DOMAIN || !url) return '';
  const m = String(url).match(/^https:\/\/([a-z0-9-]+)\.([^/]+)\/api\/?$/i);
  return m && m[2].toLowerCase() === SHOP_DOMAIN ? m[1].toLowerCase() : '';
};

// Development requires an explicitly configured API. Shop-address apps start with none until a shop is chosen.
export const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV || SHOP_DOMAIN ? '' : 'https://svqhlotlzgmwjneuphpe.supabase.co/functions/v1/karvio-api');
