import { useEffect, useState } from 'react';

// Live 12-hour clock in Bangladesh time, e.g. "06:47:12 PM".
// Shown only on desktop / laptop browsers: a screen at least 1025px wide AND a mouse or trackpad.
// Phones and tablets (touch screens) never see it — even a large iPad in landscape.
const DESKTOP_QUERY = '(min-width: 1025px) and (hover: hover) and (pointer: fine)';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
});

function useIsDesktop() {
  const get = () => typeof window !== 'undefined' && window.matchMedia?.(DESKTOP_QUERY).matches;
  const [isDesktop, setIsDesktop] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return;
    const onChange = () => setIsDesktop(mq.matches); // reacts to window resize / rotation
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <time className="live-clock" dateTime={now.toISOString()} aria-label="Current time">{fmt.format(now)}</time>;
}

export default function LiveClock() {
  // Not rendered at all on phones/tablets, so no timer runs there either.
  return useIsDesktop() ? <Clock /> : null;
}
