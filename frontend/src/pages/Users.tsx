import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw, KeyRound, Trash2, Save } from 'lucide-react';
import client from '../api/client';
import type { User } from '../types';
import { Badge } from '../components/ui/Badge';

const ROLES = ['admin', 'operator', 'viewer'];

export default function Users() {
  const { data, refetch } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => client.get('/users').then(r => r.data),
  });

  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    full_name: '',
    role: 'viewer',
    password: '',
  });
  const [selected, setSelected] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    email: '',
    full_name: '',
    role: 'viewer',
    is_active: true,
    password: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selected) {
      setEditForm({
        email: selected.email,
        full_name: selected.full_name || '',
        role: selected.role,
        is_active: selected.is_active,
        password: '',
      });
    }
  }, [selected]);

  const createUser = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await client.post('/users', {
        username: createForm.username,
        email: createForm.email,
        full_name: createForm.full_name || undefined,
        role: createForm.role,
        password: createForm.password,
      });
      setCreateForm({ username: '', email: '', full_name: '', role: 'viewer', password: '' });
      await refetch();
      setMessage('User created');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await client.put(`/users/${selected.id}`, {
        email: editForm.email,
        full_name: editForm.full_name || undefined,
        role: editForm.role,
        is_active: editForm.is_active,
        password: editForm.password || undefined,
      });
      setEditForm(prev => ({ ...prev, password: '' }));
      await refetch();
      setMessage('User updated');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Delete user ${user.username}?`)) return;
    try {
      await client.delete(`/users/${user.id}`);
      if (selected?.id === user.id) setSelected(null);
      await refetch();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete user');
    }
  };

  const generateApiKey = async (user: User) => {
    try {
      const res = await client.post(`/users/${user.id}/api-key`);
      setMessage(`API key for ${user.username}: ${res.data.api_key}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate API key');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-slate-400 text-sm">Manage users and roles</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>}
      {message && <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create User
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Username</label>
              <input className="input" value={createForm.username} onChange={e => setCreateForm(prev => ({ ...prev, username: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={createForm.email} onChange={e => setCreateForm(prev => ({ ...prev, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={createForm.full_name} onChange={e => setCreateForm(prev => ({ ...prev, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="select" value={createForm.role} onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Password</label>
              <input type="password" className="input" value={createForm.password} onChange={e => setCreateForm(prev => ({ ...prev, password: e.target.value }))} />
            </div>
          </div>
          <div>
            <button onClick={createUser} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>

        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Edit User</h3>
          {!selected && <p className="text-slate-500 text-sm">Select a user from the list to edit.</p>}
          {selected && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-200 font-medium">{selected.username}</span>
                <Badge variant={selected.is_active ? 'success' : 'warning'}>{selected.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Email</label>
                  <input className="input" value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Full Name</label>
                  <input className="input" value={editForm.full_name} onChange={e => setEditForm(prev => ({ ...prev, full_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Role</label>
                  <select className="select" value={editForm.role} onChange={e => setEditForm(prev => ({ ...prev, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Active</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.is_active ? 'bg-blue-500' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${editForm.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-xs text-slate-400">{editForm.is_active ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Reset Password</label>
                  <input type="password" className="input" value={editForm.password} onChange={e => setEditForm(prev => ({ ...prev, password: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={updateUser} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
                  <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => generateApiKey(selected)} className="btn-secondary text-sm flex items-center gap-2">
                  <KeyRound className="w-4 h-4" /> Generate API Key
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-700/50">
            <tr>
              {['Username','Email','Role','Status','Last Login','Actions'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.map(user => (
              <tr key={user.id} className="table-row" onClick={() => setSelected(user)}>
                <td className="table-cell font-medium text-slate-100">{user.username}</td>
                <td className="table-cell text-slate-300">{user.email}</td>
                <td className="table-cell text-slate-300">{user.role}</td>
                <td className="table-cell">{user.is_active ? <Badge variant="success">active</Badge> : <Badge variant="warning">inactive</Badge>}</td>
                <td className="table-cell text-slate-400 text-xs">{user.last_login ? new Date(user.last_login).toLocaleString() : '—'}</td>
                <td className="table-cell">
                  <button onClick={(e) => { e.stopPropagation(); deleteUser(user); }} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
