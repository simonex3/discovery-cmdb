import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Save } from 'lucide-react';
import client from '../api/client';

interface AppSetting {
  key: string;
  label: string;
  type: 'string' | 'integer' | 'boolean' | 'secret';
  description: string;
  value: string | null;
}

export default function Settings() {
  const [drafts, setDrafts] = useState<Record<string, string | boolean | number>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, refetch } = useQuery<AppSetting[]>({
    queryKey: ['settings'],
    queryFn: () => client.get('/settings').then(r => r.data),
  });

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string | boolean | number> = {};
    for (const s of data) {
      if (s.type === 'boolean') {
        next[s.key] = s.value === 'true';
      } else if (s.type === 'integer') {
        next[s.key] = s.value ? Number(s.value) : 0;
      } else if (s.type === 'secret') {
        next[s.key] = '';
      } else {
        next[s.key] = s.value ?? '';
      }
    }
    setDrafts(next);
  }, [data]);

  const updateDraft = (key: string, value: string | boolean | number) => {
    setDrafts(prev => ({ ...prev, [key]: value }));
  };

  const saveSetting = async (setting: AppSetting) => {
    setSavingKey(setting.key);
    setMessage(null);
    setError(null);
    try {
      if (setting.type === 'secret' && !drafts[setting.key]) {
        setError('Enter a new value for secret settings');
        setSavingKey(null);
        return;
      }
      const value = drafts[setting.key];
      const payloadValue = setting.type === 'boolean'
        ? String(value)
        : setting.type === 'integer'
          ? String(value ?? 0)
          : String(value ?? '');
      await client.put(`/settings/${setting.key}`, { value: payloadValue });
      setMessage(`${setting.label} saved`);
      await refetch();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save setting');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 text-sm">Application configuration</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>}
      {message && <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">{message}</div>}

      <div className="card space-y-3">
        {data?.map(setting => (
          <div key={setting.key} className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center border-b border-slate-800 py-3 last:border-b-0">
            <div>
              <div className="text-sm font-medium text-slate-200">{setting.label}</div>
              <div className="text-xs text-slate-500">{setting.description}</div>
              <div className="text-xs text-slate-600 font-mono mt-1">{setting.key}</div>
            </div>
            <div>
              {setting.type === 'boolean' && (
                <button
                  type="button"
                  onClick={() => updateDraft(setting.key, !(drafts[setting.key] as boolean))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${drafts[setting.key] ? 'bg-blue-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${drafts[setting.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              )}
              {setting.type === 'integer' && (
                <input
                  type="number"
                  className="input"
                  value={drafts[setting.key] as number}
                  onChange={e => updateDraft(setting.key, Number(e.target.value))}
                />
              )}
              {setting.type === 'string' && (
                <input
                  className="input"
                  value={drafts[setting.key] as string}
                  onChange={e => updateDraft(setting.key, e.target.value)}
                />
              )}
              {setting.type === 'secret' && (
                <input
                  type="password"
                  className="input"
                  placeholder={setting.value ? '********' : 'Set secret'}
                  value={drafts[setting.key] as string}
                  onChange={e => updateDraft(setting.key, e.target.value)}
                />
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => saveSetting(setting)}
                disabled={savingKey === setting.key}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> {savingKey === setting.key ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ))}
        {data?.length === 0 && (
          <div className="text-slate-500 text-sm">No settings found</div>
        )}
      </div>
    </div>
  );
}
