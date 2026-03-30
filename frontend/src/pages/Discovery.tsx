import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radar, RefreshCw, PlayCircle } from 'lucide-react';
import client from '../api/client';
import { Badge } from '../components/ui/Badge';

export default function Discovery() {
  const [cidr, setCidr] = useState('');
  const [form, setForm] = useState({
    network_range: '',
    auto_discovery_enabled: false,
    discovery_interval_minutes: 60,
    health_check_interval_minutes: 5,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['discovery-status'],
    queryFn: () => client.get('/discovery/status').then(r => r.data),
    refetchInterval: 5000,
  });

  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['discovery-settings'],
    queryFn: () => client.get('/discovery/settings').then(r => r.data),
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      network_range: settings.network_range || '',
      auto_discovery_enabled: !!settings.auto_discovery_enabled,
      discovery_interval_minutes: settings.discovery_interval_minutes ?? 60,
      health_check_interval_minutes: settings.health_check_interval_minutes ?? 5,
    });
  }, [settings]);

  const handleRunScan = async () => {
    setError(null);
    setMessage(null);
    try {
      const range = cidr || form.network_range;
      const res = await client.post('/discovery/scan', null, { params: { cidr: range } });
      setMessage(res.data.message || 'Discovery started');
      await refetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start discovery');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await client.put('/discovery/settings', null, { params: form });
      setMessage('Settings updated');
      await refetchSettings();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Discovery</h1>
          <p className="text-slate-400 text-sm">Run network scans and configure auto-discovery</p>
        </div>
        <button onClick={() => { refetchStatus(); refetchSettings(); }} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}
      {message && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">{message}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Radar className="w-4 h-4" /> Current Status
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant={status?.running ? 'warning' : 'success'}>
              {status?.running ? 'Running' : 'Idle'}
            </Badge>
            {status?.cidr && <span className="text-xs text-slate-400 font-mono">{status.cidr}</span>}
          </div>
          <div className="text-xs text-slate-500 space-y-1">
            <div>Started: {status?.started_at ? new Date(status.started_at).toLocaleString() : '—'}</div>
            <div>Completed: {status?.completed_at ? new Date(status.completed_at).toLocaleString() : '—'}</div>
            <div>Actor: {status?.actor || 'system'}</div>
          </div>
          {status?.result && (
            <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300">
              Hosts: {status.result.hosts_found} · New: {status.result.discovered_new} · Updated: {status.result.updated} · Failed: {status.result.failed}
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Run Scan</h3>
          <div>
            <label className="label">CIDR Range</label>
            <input
              className="input font-mono"
              placeholder={form.network_range || '192.168.178.0/24'}
              value={cidr}
              onChange={e => setCidr(e.target.value)}
            />
          </div>
          <button onClick={handleRunScan} className="btn-primary text-sm flex items-center gap-2 w-full">
            <PlayCircle className="w-4 h-4" /> Start Discovery
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">Auto-Discovery Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Network Range</label>
            <input
              className="input font-mono"
              value={form.network_range}
              onChange={e => setForm(prev => ({ ...prev, network_range: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Auto-Discovery</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                  onClick={() => setForm(prev => ({ ...prev, auto_discovery_enabled: !prev.auto_discovery_enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.auto_discovery_enabled ? 'bg-blue-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${form.auto_discovery_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              <span className="text-xs text-slate-400">{form.auto_discovery_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
          <div>
            <label className="label">Discovery Interval (min)</label>
            <input
              type="number"
              className="input"
              value={form.discovery_interval_minutes}
              onChange={e => setForm(prev => ({ ...prev, discovery_interval_minutes: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="label">Health Check Interval (min)</label>
            <input
              type="number"
              className="input"
              value={form.health_check_interval_minutes}
              onChange={e => setForm(prev => ({ ...prev, health_check_interval_minutes: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={handleSaveSettings} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
