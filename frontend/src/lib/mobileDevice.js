/** Device family detection: narrow desktop windows and touch-enabled Windows laptops stay desktop. */
export function isMobileOrTablet(nav = globalThis.navigator) {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  return !!nav.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(ua)
    || (/Macintosh|MacIntel/i.test(ua + ' ' + (nav.platform || '')) && nav.maxTouchPoints > 1);
}
