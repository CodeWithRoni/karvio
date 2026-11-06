// Phone app behaviour (Android / iOS builds made with Capacitor):
//  - Android back button: closes an open dialog or the side menu first, then goes back a page,
//    and on the Dashboard asks before leaving the app.
//  - status bar icons follow the light / dark theme.
// On a computer browser none of this runs (no back button events), so the web app is unchanged.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useStore } from '../lib/store';
import { DoorIcon } from './Layout';

const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const route = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0] || '/';
const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Have a good morning' : h < 17 ? 'Have a good afternoon' : h < 21 ? 'Have a good evening' : 'Good night';
};

export function NativeShell() {
  const theme = useStore((s) => s.theme);
  const user = useStore((s) => s.user);
  const shop = useStore((s) => s.settings?.shop_name);
  const [ask, setAsk] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const askRef = useRef(false);
  askRef.current = ask;
  const stayRef = useRef(null);

  /** What the back button does, in order. `canGoBack` comes from the Android WebView history. */
  const onBack = useCallback((canGoBack) => {
    if (askRef.current) { setAsk(false); return 'stay'; } // back again on the exit dialog = stay
    // an open dialog or the phone menu closes first (they all close on Escape)
    if (document.querySelector('.modal-bg, .shell.nav-open')) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return 'closed';
    }
    if (route() !== '/') {
      if (canGoBack) window.history.back(); else window.location.hash = '#/';
      return 'back';
    }
    setAsk(true); // on the Dashboard (or the sign-in screen): ask before leaving
    return 'ask';
  }, []);

  useEffect(() => {
    window.__karvioBack = onBack; // lets the automated tests press "back" in a normal browser
    if (!isAndroid()) return undefined;
    let handle = null, gone = false;
    CapApp.addListener('backButton', ({ canGoBack }) => onBack(canGoBack)).then((h) => { if (gone) h.remove(); else handle = h; });
    return () => { gone = true; handle?.remove(); };
  }, [onBack]);

  // light icons on the dark theme, dark icons on the light theme
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  }, [theme]);

  useEffect(() => {
    if (!ask) { setLeaving(false); return undefined; }
    stayRef.current?.focus();
    const esc = (e) => e.key === 'Escape' && setAsk(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [ask]);

  const exit = () => {
    setLeaving(true);
    window.__karvioExited = true;
    // let the door "close" before the app goes away
    setTimeout(() => { CapApp.exitApp().catch(() => setAsk(false)); }, 380);
  };

  if (!ask) return null;
  const name = user?.name ? user.name.split(' ')[0] : '';
  return (
    <div className="exit-bg" onMouseDown={(e) => e.target === e.currentTarget && setAsk(false)}>
      <div className={`exit-sheet ${leaving ? 'leaving' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="exit-title" aria-describedby="exit-text">
        <div className="exit-grip" aria-hidden="true" />
        <div className="exit-door" aria-hidden="true"><DoorIcon open={!leaving} size={34} /></div>
        <h2 id="exit-title">Exit Karvio?</h2>
        <p id="exit-text">{greeting()}{name ? `, ${name}` : ''}! {shop ? <><b>{shop}</b> stays </> : 'Your shop stays '}saved online — everything you have saved will be here when you come back.</p>
        <div className="exit-actions">
          <button type="button" ref={stayRef} className="btn btn-ghost" onClick={() => setAsk(false)}>Stay</button>
          <button type="button" className="btn btn-danger" onClick={exit} disabled={leaving}>{leaving ? 'Closing…' : 'Exit'}</button>
        </div>
        <small className="exit-hint">Press back again to stay</small>
      </div>
    </div>
  );
}
