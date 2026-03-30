import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Router, PlugZap, PlayCircle, Stethoscope, Network } from 'lucide-react';
import client from '../api/client';
import { Badge } from '../components/ui/Badge';

interface FritzConfig {
  host: string;
  username: string;
  configured: boolean;
  sync_enabled: boolean;
}

interface FritzStatus {
  last_sync?: string;
  last_sync_result?: string;
  configured: boolean;
}

export default function FritzBox() {
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingHosts, setSyncingHosts] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null);

  const { data: config, refetch: refetchConfig } = useQuery<FritzConfig>({
    queryKey: ['fritz-config'],
    queryFn: () => client.get('/fritz/config').then(r => r.data),
  });

  const { data: status, refetch: refetchStatus } = useQuery<FritzStatus>({
    queryKey: ['fritz-status'],
    queryFn: () => client.get('/fritz/sync/status').then(r => r.data),
  });

  useEffect(() => {
    if (config) {
      setHost(config.host || '');
      setUsername(config.username || '');
      setSyncEnabled(config.sync_enabled ?? true);
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setStatusMsg(null);
    try {
      await client.post('/fritz/config', {
        host,
        username,
        password,
        sync_enabled: syncEnabled,
      });
      setPassword('');
      setStatusMsg('FRITZ!Box configuration saved');
      await refetchConfig();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await client.post('/fritz/sync');
      setStatusMsg(res.data?.message || 'Sync completed');
      await refetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncHosts = async () => {
    setSyncingHosts(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await client.post('/fritz/sync/hosts');
      setStatusMsg(res.data?.message || 'Host sync completed');
      await refetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Host sync failed');
    } finally {
      setSyncingHosts(false);
    }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    setError(null);
    setDiagnoseResult(null);
    try {
      const res = await client.get('/fritz/diagnose');
      setDiagnoseResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Diagnose failed');
    } finally {
      setDiagnosing(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">FRITZ!Box</h1>
          <p className="text-slate-400 text-sm">Mesh relationships from FRITZ!Box</p>
        </div>
        <button onClick={() => { refetchConfig(); refetchStatus(); }} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>}
      {statusMsg && <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">{statusMsg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Router className="w-4 h-4" /> Configuration
          </h3>
          <div>
            <label className="label">FRITZ!Box Host</label>
            <input className="input" placeholder="192.168.178.1" value={host} onChange={e => setHost(e.target.value)} />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" placeholder="Leave blank to keep existing" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSyncEnabled(!syncEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${syncEnabled ? 'bg-blue-500' : 'bg-slate-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${syncEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-xs text-slate-400">Mesh sync enabled</span>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
              <PlugZap className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <PlayCircle className="w-4 h-4" /> Sync
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant={status?.configured ? 'success' : 'warning'}>
              {status?.configured ? 'Configured' : 'Not Configured'}
            </Badge>
            {status?.last_sync && (
              <span className="text-xs text-slate-400">Last: {new Date(status.last_sync).toLocaleString()}</span>
            )}
          </div>
          {status?.last_sync_result && (
            <div className="text-xs text-slate-500 font-mono bg-slate-800/50 rounded p-2 max-h-24 overflow-auto">
              {status.last_sync_result}
            </div>
          )}
          <div className="space-y-2">
            <button onClick={handleSync} disabled={syncing} className="btn-primary text-sm flex items-center gap-2 w-full">
              <PlayCircle className="w-4 h-4" /> {syncing ? 'Syncing...' : 'Mesh Sync (Repeater Topology)'}
            </button>
            <button onClick={handleSyncHosts} disabled={syncingHosts} className="btn-secondary text-sm flex items-center gap-2 w-full">
              <Network className="w-4 h-4" /> {syncingHosts ? 'Syncing...' : 'Host Sync (All Devices → Router)'}
            </button>
            <button onClick={handleDiagnose} disabled={diagnosing} className="btn-secondary text-sm flex items-center gap-2 w-full">
              <Stethoscope className="w-4 h-4" /> {diagnosing ? 'Diagnosing...' : 'Run Diagnose'}
            </button>
          </div>
        </div>
      </div>

      {diagnoseResult && (
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Stethoscope className="w-4 h-4" /> Diagnose Result
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">SID Login</div>
              <div className={diagnoseResult.sid_ok ? 'text-green-400 font-medium' : 'text-red-400'}>
                {diagnoseResult.sid_ok ? 'OK' : `Failed: ${diagnoseResult.sid_error || 'unknown'}`}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">TR-064 Hosts</div>
              <div className={diagnoseResult.tr064_host_count > 0 ? 'text-green-400 font-medium' : 'text-amber-400'}>
                {diagnoseResult.tr064_error
                  ? `Error: ${diagnoseResult.tr064_error}`
                  : `${diagnoseResult.tr064_host_count ?? '—'} devices`}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">Host List Path</div>
              <div className="text-slate-300 font-mono text-[10px] truncate">{diagnoseResult.host_list_path || '—'}</div>
              {diagnoseResult.host_list_count != null && (
                <div className="text-slate-400">{diagnoseResult.host_list_count} hosts</div>
              )}
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">Mesh Path</div>
              <div className="text-slate-300 font-mono text-[10px] truncate">{diagnoseResult.mesh_path || 'not supported'}</div>
              {diagnoseResult.nodes != null && (
                <div className="text-slate-400">{diagnoseResult.nodes} nodes</div>
              )}
            </div>
          </div>

          {diagnoseResult.tr064_host_preview?.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Host preview (first 3 via TR-064):</div>
              <div className="space-y-1">
                {diagnoseResult.tr064_host_preview.map((h: any, i: number) => (
                  <div key={i} className="text-xs font-mono flex gap-3 bg-slate-800/30 rounded px-2 py-1">
                    <span className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${h.active === '1' ? 'bg-green-400' : 'bg-slate-600'}`} />
                    <span className="text-slate-300 w-28 truncate">{h.ip || '—'}</span>
                    <span className="text-slate-500 w-36 truncate">{h.mac || '—'}</span>
                    <span className="text-slate-400 truncate">{h.name || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diagnoseResult.meshlist_status && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Mesh endpoints:</div>
              {Object.entries(diagnoseResult.meshlist_status).map(([url, s]) => (
                <div key={url} className="text-xs font-mono flex justify-between gap-4 bg-slate-800/30 rounded px-2 py-1 mb-0.5">
                  <span className="text-slate-500 truncate">{url}</span>
                  <span className={s === 200 ? 'text-green-400' : 'text-slate-600'}>{String(s)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
