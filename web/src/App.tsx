import { useCallback, useEffect, useState } from 'react';
import { api, type User } from './api';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { MyClients } from './components/MyClients';
import { Shell, type NavItem } from './components/Shell';
import { Splash } from './components/Splash';
import { Uploads } from './components/Uploads';
import { Users } from './components/Users';
import { useToast } from './components/ui';

const ADMIN_NAV: NavItem[] = [
  { id: 'home', label: 'Asosiy oyna', icon: 'home' },
  { id: 'upload', label: "Ma'lumot yuklash", icon: 'upload' },
  { id: 'users', label: 'Xodimlar', icon: 'users' },
];
const STAFF_NAV: NavItem[] = [
  { id: 'home', label: 'Asosiy oyna', icon: 'home' },
  { id: 'clients', label: 'Mijozlarim', icon: 'list' },
];

const pageFromHash = () => location.hash.replace(/^#\/?/, '') || 'home';

export function App() {
  const toast = useToast();
  const [splash, setSplash] = useState(true);
  const [auth, setAuth] = useState<{ needsSetup: boolean; user: User | null } | null>(null);
  const [page, setPage] = useState(pageFromHash);

  useEffect(() => {
    api<{ needsSetup: boolean; user: User | null }>('/api/auth/state').then(setAuth).catch((e) => {
      toast(e.message, 'err');
      setAuth({ needsSetup: false, user: null });
    });
    const expired = () => setAuth((a) => a && { ...a, user: null });
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('auth:expired', expired);
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('auth:expired', expired); window.removeEventListener('hashchange', onHash); };
  }, [toast]);

  const endSplash = useCallback(() => setSplash(false), []);
  const navigate = (id: string) => { location.hash = `/${id}`; };

  if (splash) return <Splash onDone={endSplash} />;
  if (!auth) return <div className="boot" />;
  const { user } = auth;
  if (!user) return <Auth needsSetup={auth.needsSetup} onAuthed={(u) => { setAuth({ needsSetup: false, user: u }); navigate('home'); }} />;

  const nav = user.role === 'admin' ? ADMIN_NAV : STAFF_NAV;
  const active = nav.some((n) => n.id === page) ? page : 'home';

  return (
    <Shell
      user={user}
      nav={nav}
      active={active}
      onNavigate={navigate}
      onLogout={async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setAuth({ needsSetup: false, user: null }); }}
    >
      <div className="page" key={active}>
        {active === 'home' && <Dashboard user={user} onUpload={user.role === 'admin' ? () => navigate('upload') : undefined} />}
        {active === 'upload' && <Uploads />}
        {active === 'users' && <Users me={user} />}
        {active === 'clients' && <MyClients />}
      </div>
    </Shell>
  );
}
