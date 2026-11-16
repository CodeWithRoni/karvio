// A short, readable name for this device, sent with the sign-in so admins can tell signed-in devices apart.
export function deviceLabel() {
  try {
    const ua = navigator.userAgent || '';
    const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone / iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Unknown system';
    if (typeof window !== 'undefined' && window.karvio) return `Karvio desktop app · ${os}`;
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return `Karvio phone app · ${os}`;
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return `${browser} on ${os}`;
  } catch { return 'Unknown device'; }
}
