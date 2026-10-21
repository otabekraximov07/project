import { useEffect, useState } from 'react';

const BRAND = 'HamrohNasiya';
export const SPLASH_MS = 3000;

/** The 3-second intro shown every time the app opens. */
export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), SPLASH_MS - 450);
    const t2 = setTimeout(onDone, SPLASH_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div className={`splash ${leaving ? 'leaving' : ''}`} aria-label="HamrohNasiya Undiruv">
      <div className="splash-glow" />
      <svg className="splash-mark" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F3D58C" />
            <stop offset="1" stopColor="#B8893A" />
          </linearGradient>
        </defs>
        <circle className="ring" cx="60" cy="60" r="52" />
        <path className="h" d="M42 38v44M78 38v44M42 60h36" />
      </svg>
      <h1 className="splash-brand">
        {[...BRAND].map((ch, i) => (
          <span key={i} style={{ animationDelay: `${0.55 + i * 0.05}s` }} className={i >= 6 ? 'gold' : ''}>{ch}</span>
        ))}
      </h1>
      <p className="splash-sub">Undiruv tizimi</p>
      <div className="splash-bar"><i /></div>
    </div>
  );
}
