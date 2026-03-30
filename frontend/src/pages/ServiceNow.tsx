import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cloud, RefreshCw, Link2, PlayCircle, ShieldCheck } from 'lucide-react';
import client from '../api/client';
import { Badge } from '../components/ui/Badge';

interface SNConfig {
  instance_url: string;
  username: string;
  configured: boolean;
}

interface SNSyncStatus {
  last_sync?: string;
  last_sync_result?: string;
  configured: boolean;
}

export default function ServiceNow() {
  const [instanceUrl, setInstanceUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [direction, setDirection] = useState('both');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: config, refetch: refetchConfig } = useQuery<SNConfig>({
    queryKey: ['sn-config'],
    queryFn: () => client.get('/servicenow/config').then(r => r.data),
  });

  const { data: syncStatus, refetch: refetchSync } = useQuery<SNSyncStatus>({
    queryKey: ['sn-sync-status'],
    queryFn: () => client.get('/servicenow/sync/status').then(r => r.data),
  });

  useEffect(() => {
    if (config) {
      setInstanceUrl(config.instance_url || '');
      setUsername(config.username || '');
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setStatusMsg(null);
    try {
      await client.post('/servicenow/config', {
        instance_url: instanceUrl,
        username,
        password,
      });
      setPassword('');
      setStatusMsg('ServiceNow configuration saved');
      await refetchConfig();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setError(null);
    setStatusMsg(null);
    try {
      const res = await client.post('/servicenow/test');
      setStatusMsg(res.data.message || (res.data.connected ? 'Connected' : 'Connection failed'));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Connection test failed');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await client.post('/servicenow/sync', null, { params: { direction } });
      setStatusMsg(res.data?.message || 'Sync completed');
      await refetchSync();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ServiceNow</h1>
          <p className="text-slate-400 text-sm">Configure and sync with ServiceNow CMDB</p>
        </div>
        <button onClick={() => { refetchConfig(); refetchSync(); }} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}
      {statusMsg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">{statusMsg}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Configuration
          </h3>
          <div>
            <label className="label">Instance URL</label>
            <input className="input" placeholder="https://dev12345.service-now.com" value={instanceUrl} onChange={e => setInstanceUrl(e.target.value)} />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" placeholder="Leave blank to keep existing" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
              <Cloud className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleTest} className="btn-secondary text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Test Connection
            </button>
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <PlayCircle className="w-4 h-4" /> Sync
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant={syncStatus?.configured ? 'success' : 'warning'}>
              {syncStatus?.configured ? 'Configured' : 'Not Configured'}
            </Badge>
            {syncStatus?.last_sync && (
              <span className="text-xs text-slate-400">Last Sync: {new Date(syncStatus.last_sync).toLocaleString()}</span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {syncStatus?.last_sync_result || 'No sync history'}
          </div>
          <div>
            <label className="label">Direction</label>
            <select className="select" value={direction} onChange={e => setDirection(e.target.value)}>
              <option value="both">Import + Export</option>
              <option value="import">Import from ServiceNow</option>
              <option value="export">Export to ServiceNow</option>
            </select>
          </div>
          <button onClick={handleSync} disabled={syncing} className="btn-primary text-sm flex items-center gap-2 w-full">
            {syncing ? 'Syncing...' : 'Run Sync'}
          </button>
        </div>
      </div>
    </div>
  );
}
