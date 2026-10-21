import { useState, type FormEvent } from 'react';
import { api, type User } from '../api';
import { Icon } from './ui';

/** First run: create the first (admin) account. Afterwards: login. */
export function Auth({ needsSetup, onAuthed }: { needsSetup: boolean; onAuthed: (u: User) => void }) {
  const [f, setF] = useState({ first_name: '', last_name: '', login: '', password: '', password2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (needsSetup && f.password !== f.password2) return setError('Parollar bir xil emas.');
    setBusy(true);
    try {
      const { user } = needsSetup
        ? await api<{ user: User }>('/api/auth/setup', { method: 'POST', body: f })
        : await api<{ user: User }>('/api/auth/login', { method: 'POST', body: { login: f.login, password: f.password } });
      onAuthed(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="logo">H</div>
          <div><b>HamrohNasiya</b><span>Undiruv tizimi</span></div>
        </div>
        <h2>{needsSetup ? 'Tizimni sozlash' : 'Tizimga kirish'}</h2>
        <p className="muted">
          {needsSetup
            ? "Birinchi foydalanuvchi rahbar sifatida yaratiladi. Keyingi xodimlarni tizim ichida qo'shasiz."
            : 'Login va parolingizni kiriting.'}
        </p>
        {needsSetup && (
          <div className="row2">
            <label className="field"><span>Ism</span><input value={f.first_name} onChange={set('first_name')} autoComplete="given-name" required /></label>
            <label className="field"><span>Familiya</span><input value={f.last_name} onChange={set('last_name')} autoComplete="family-name" required /></label>
          </div>
        )}
        <label className="field"><span>Login</span><input value={f.login} onChange={set('login')} autoComplete="username" autoCapitalize="none" required autoFocus={!needsSetup} /></label>
        <label className="field"><span>Parol</span><input type="password" value={f.password} onChange={set('password')} autoComplete={needsSetup ? 'new-password' : 'current-password'} required /></label>
        {needsSetup && (
          <label className="field"><span>Parolni takrorlang</span><input type="password" value={f.password2} onChange={set('password2')} autoComplete="new-password" required /></label>
        )}
        {error && <div className="form-error"><Icon name="alert" />{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Kuting…' : needsSetup ? 'Yaratish va kirish' : 'Kirish'}</button>
      </form>
    </div>
  );
}
