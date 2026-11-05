import { useEffect, useState } from 'react';

// Live 12-hour clock in Bangladesh time, e.g. "06:47:12 PM".
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
});

export default function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <time className="live-clock" dateTime={now.toISOString()} aria-label="Current time">{fmt.format(now)}</time>;
}
