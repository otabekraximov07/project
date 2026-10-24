import type { ReactNode } from 'react';
import type { User } from '../api';
import { Icon, type IconName } from './ui';

export interface NavItem { id: string; label: string; icon: IconName; badge?: number }

/** Page layout: navigator on the left, content on the right. */
export function Shell({ user, nav, active, onNavigate, onLogout, children }: {
  user: User; nav: NavItem[]; active: string; onNavigate: (id: string) => void; onLogout: () => void; children: ReactNode;
}) {
  const initials = (user.first_name[0] + user.last_name[0]).toUpperCase();
  return (
    <div className="shell">
      <aside className="nav">
        <div className="nav-brand">
          <div className="logo">H</div>
          <div><b>HamrohNasiya</b><span>{user.role === 'admin' ? 'Rahbariyat paneli' : 'Xodim paneli'}</span></div>
        </div>
        <nav className="nav-list">
          {nav.map((n) => (
            <button key={n.id} className={`nav-item ${active === n.id ? 'on' : ''}`} onClick={() => onNavigate(n.id)}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {!!n.badge && <span className="nav-badge">{n.badge > 99 ? '99+' : n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-user">
          <div className="avatar">{initials}</div>
          <div className="who"><b>{user.last_name} {user.first_name}</b><span>{user.role === 'admin' ? 'Rahbar' : 'Xodim'}</span></div>
          <button className="icon-btn" onClick={onLogout} title="Chiqish" aria-label="Chiqish"><Icon name="logout" /></button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="page-tools">{children}</div>}
    </header>
  );
}
