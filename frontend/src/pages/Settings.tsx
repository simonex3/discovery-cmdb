import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Save, Network, Router, ExternalLink, Settings as SettingsIcon, Trash2, CheckCircle, Mail, ShieldAlert, Bell } from 'lucide-react';
import client from '../api/client';

interface AppSetting {
  key: string;
  label: string;
  type: 'string' | 'integer' | 'boolean' | 'secret';
  description: string;
  value: string | null;
}

const GROUPS: { label: string; icon: any; match: (k: string) => boolean }[] = [
  { label: 'Network & Discovery', icon: Network, match: k => /network_range|auto_discovery|discovery_interval|health_check/.test(k) },
  { label: 'Fritz!Box', icon: Router, match: k => /fritz/.test(k) },
  { label: 'ServiceNow', icon: ExternalLink, match: k => /servicenow|^sn_/.test(k) },
  { label: 'E-Mail Benachrichtigungen', icon: Mail, match: k => /^smtp_/.test(k) },
  { label: 'Alerts & Webhooks', icon: Bell, match: k => /webhook|notify/.test(k) },
  { label: 'Vulnerability Scan', icon: ShieldAlert, match: k => /^nvd_/.test(k) },
  { label: 'General', icon: SettingsIcon, match: () => true },
];

function groupSettings(settings: AppSetting[]) {
  const assigned = new Set<string>();
  return GROUPS.map(g => {
    const items = settings.filter(s => !assigned.has(s.key) && g.match(s.key));
    items.forEach(s => assigned.add(s.key));
    return { ...g, items };
  }).filter(g => g.items.length > 0);
}

export default function Settings() {
  const [drafts, setDrafts] = useState<Record<string, string | boolean | number>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);

  const { data, refetch } = useQuery<AppSetting[]>({
    queryKey: ['settings'],
    queryFn: () => client.get('/settings').then(r => r.data),
  });

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string | boolean | number> = {};
    for (const s of data) {
      if (s.type === 'boolean') next[s.key] = s.value === 'true';
      else if (s.type === 'integer') next[s.key] = s.value ? Number(s.value) : 0;
      else if (s.type === 'secret') next[s.key] = '';
      else next[s.key] = s.value ?? '';
    }
    setDrafts(next);
  }, [data]);

  const updateDraft = (key: string, value: string | boolean | number) =>
    setDrafts(prev => ({ ...prev, [key]: value }));

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

  const handleCleanup = async () => {
    setCleanupRunning(true);
    setCleanupResult(null);
    try {
      const res = await client.post('/relationships/cleanup');
      setCleanupResult(`${res.data.deleted} relationships deleted — only runs_on kept`);
    } catch (err: any) {
      setCleanupResult(`Error: ${err.response?.data?.detail || 'Failed'}`);
    } finally {
      setCleanupRunning(false);
    }
  };

  const grouped = data ? groupSettings(data) : [];

  return (
    <div className="space-y-6 animate-fade-in">
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
      {message && <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />{message}</div>}

      {grouped.map(group => (
        <div key={group.label} className="card space-y-1">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800/60 mb-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <group.icon className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">{group.label}</h3>
          </div>
          {group.items.map(setting => (
            <div key={setting.key} className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center border-b border-slate-800/40 py-3 last:border-b-0">
              <div>
                <div className="text-sm font-medium text-slate-200">{setting.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{setting.description}</div>
                <div className="text-xs text-slate-700 font-mono mt-1">{setting.key}</div>
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
                  <input type="number" className="input" value={drafts[setting.key] as number}
                    onChange={e => updateDraft(setting.key, Number(e.target.value))} />
                )}
                {setting.type === 'string' && (
                  <input className="input" value={drafts[setting.key] as string}
                    onChange={e => updateDraft(setting.key, e.target.value)} />
                )}
                {setting.type === 'secret' && (
                  <input type="password" className="input" placeholder={setting.value ? '********' : 'Set secret'}
                    value={drafts[setting.key] as string}
                    onChange={e => updateDraft(setting.key, e.target.value)} />
                )}
              </div>
              <div className="flex justify-end">
                <button onClick={() => saveSetting(setting)} disabled={savingKey === setting.key}
                  className="btn-primary text-sm flex items-center gap-2">
                  <Save className="w-4 h-4" /> {savingKey === setting.key ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Maintenance */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800/60">
          <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">Maintenance</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
          <div>
            <div className="text-sm font-medium text-slate-200">Cleanup Relationships</div>
            <div className="text-xs text-slate-500 mt-0.5">Delete all auto-generated relationships except <span className="font-mono">runs_on</span>. Fritz!Box sync will recreate them.</div>
          </div>
          <div>
            {cleanupResult && (
              <div className={`text-xs px-3 py-2 rounded-lg ${cleanupResult.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                {cleanupResult}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={handleCleanup} disabled={cleanupRunning}
              className="btn-danger text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> {cleanupRunning ? 'Cleaning...' : 'Cleanup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
