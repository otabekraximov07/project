import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Role, type User } from '../api';
import { money, periodLabel } from '../format';
import { PageHead } from './Shell';
import { Confirm, Icon, Modal, useToast } from './ui';

type Row = User & { clients: number };
type Form = { first_name: string; last_name: string; login: string; password: string; role: Role };
const EMPTY: Form = { first_name: '', last_name: '', login: '', password: '', role: 'xodim' };

export function Users({ me }: { me: User }) {
  const toast = useToast();
  const [users, setUsers] = useState<Row[]>([]);
  const [period, setPeriod] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);

  const load = useCallback(() => {
    api<{ users: Row[]; period: string | null }>('/api/users')
      .then((r) => { setUsers(r.users); setPeriod(r.period); })
      .catch((e) => toast(e.message, 'err'));
  }, [toast]);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/users', { method: 'POST', body: form });
      toast(`${form.last_name} ${form.first_name} qo'shildi`);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast((err as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Foydalanuvchilar" sub="Excel'dagi X ustunidagi ism bilan bir xil Familiya va Ism kiritilsa, mijozlar xodimga avtomatik biriktiriladi." />

      <form className="panel user-form" onSubmit={add}>
        <div className="panel-head"><h3>Yangi foydalanuvchi</h3></div>
        <UserFields form={form} setForm={setForm} requirePassword />
        <button className="btn primary" disabled={busy}><Icon name="plus" />Qo'shish</button>
      </form>

      <section className="panel">
        <div className="panel-head">
          <h3>Ro'yxat</h3>
          <span>{period ? `Mijozlar soni: ${periodLabel(period)}` : ''}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Familiya va ism</th><th>Login</th><th>Rol</th><th className="num">Biriktirilgan mijozlar</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.last_name} {u.first_name}</b>{u.id === me.id && <span className="muted"> · siz</span>}</td>
                  <td className="mono">{u.login}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'gold' : 'blue'}`}>{u.role === 'admin' ? 'Rahbar' : 'Xodim'}</span></td>
                  <td className="num">{u.role === 'xodim' ? money(u.clients) : '—'}</td>
                  <td className="actions">
                    <button className="icon-btn" title="Tahrirlash" onClick={() => setEditing(u)}><Icon name="edit" /></button>
                    {u.id !== me.id && <button className="icon-btn danger" title="O'chirish" onClick={() => setToDelete(u)}><Icon name="trash" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && <EditUser user={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {toDelete && (
        <Confirm
          title="Foydalanuvchini o'chirish"
          text={<>{toDelete.last_name} {toDelete.first_name} tizimga kira olmaydi. Uning mijozlari Excel'da qoladi va shu ism bilan yangi xodim qo'shilsa, unga o'tadi.</>}
          onClose={() => setToDelete(null)}
          onOk={async () => {
            await api(`/api/users/${toDelete.id}`, { method: 'DELETE' }).catch((e) => { toast(e.message, 'err'); throw e; });
            toast("O'chirildi");
            load();
          }}
        />
      )}
    </>
  );
}

function UserFields({ form, setForm, requirePassword }: { form: Form; setForm: (f: Form) => void; requirePassword: boolean }) {
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="fields-grid">
      <label className="field"><span>Familiya</span><input value={form.last_name} onChange={set('last_name')} placeholder="Zokirov" required /></label>
      <label className="field"><span>Ism</span><input value={form.first_name} onChange={set('first_name')} placeholder="Muhammadqodir" required /></label>
      <label className="field"><span>Login</span><input value={form.login} onChange={set('login')} autoCapitalize="none" autoComplete="off" required /></label>
      <label className="field">
        <span>{requirePassword ? 'Parol' : "Yangi parol (o'zgartirmasangiz bo'sh qoldiring)"}</span>
        <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required={requirePassword} minLength={6} />
      </label>
      <label className="field">
        <span>Rol</span>
        <select value={form.role} onChange={set('role')}>
          <option value="xodim">Xodim</option>
          <option value="admin">Rahbar (admin panel)</option>
        </select>
      </label>
    </div>
  );
}

function EditUser({ user, onClose, onSaved }: { user: Row; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Form>({ first_name: user.first_name, last_name: user.last_name, login: user.login, password: '', role: user.role });
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: form });
      toast('Saqlandi');
      onSaved();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Foydalanuvchini tahrirlash" onClose={onClose}>
      <form onSubmit={save} className="stack">
        <UserFields form={form} setForm={setForm} requirePassword={false} />
        <div className="modal-foot inline">
          <button type="button" className="btn ghost" onClick={onClose}>Bekor qilish</button>
          <button className="btn primary" disabled={busy}>Saqlash</button>
        </div>
      </form>
    </Modal>
  );
}
