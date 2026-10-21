import { useState } from 'react';
import type { User } from '../api';
import { Dashboard } from './Dashboard';
import { Team } from './Team';

type Tab = 'xodimlar' | 'undiruv';
const KEY = 'home-tab';

function savedTab(): Tab {
  try {
    return localStorage.getItem(KEY) === 'xodimlar' ? 'xodimlar' : 'undiruv';
  } catch {
    return 'undiruv';
  }
}

/** Management home: "Xodimlar" (team results) and "Undiruv" (portfolio). */
export function Home({ user, onUpload }: { user: User; onUpload: () => void }) {
  const [tab, setTab] = useState<Tab>(savedTab);
  const choose = (t: Tab) => {
    setTab(t);
    try { localStorage.setItem(KEY, t); } catch { /* private mode: just don't remember */ }
  };
  return (
    <>
      <div className="top-tabs" role="tablist" aria-label="Bo'lim">
        <button role="tab" aria-selected={tab === 'xodimlar'} className={tab === 'xodimlar' ? 'on' : ''} onClick={() => choose('xodimlar')}>Xodimlar</button>
        <button role="tab" aria-selected={tab === 'undiruv'} className={tab === 'undiruv' ? 'on' : ''} onClick={() => choose('undiruv')}>Undiruv</button>
      </div>
      <div className="tab-body" key={tab}>
        {tab === 'xodimlar' ? <Team /> : <Dashboard user={user} title="Undiruv" onUpload={onUpload} />}
      </div>
    </>
  );
}
