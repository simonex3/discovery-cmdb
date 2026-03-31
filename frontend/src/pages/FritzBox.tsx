import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Router, PlugZap, PlayCircle, Stethoscope, Network, Power, AlertTriangle } from 'lucide-react';
import client from '../api/client';
import { Badge } from '../components/ui/Badge';
import type { CI } from '../types';

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

const TYPE_LABEL: Record<string, string> = {
  router: 'Router',
  access_point: 'Repeater / AP',
};

export default function FritzBox() {
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingNetdev, setSyncingNetdev] = useState(false);
  const [syncingHosts, setSyncingHosts] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null);
  const [rebootingId, setRebootingId] = useState<string | null>(null);

  const { data: config, refetch: refetchConfig } = useQuery<FritzConfig>({
    queryKey: ['fritz-config'],
    queryFn: () => client.get('/fritz/config').then(r => r.data),
  });

  const { data: status, refetch: refetchStatus } = useQuery<FritzStatus>({
    queryKey: ['fritz-status'],
    queryFn: () => client.get('/fritz/sync/status').then(r => r.data),
  });

  const { data: fritzDevices, refetch: refetchDevices } = useQuery<CI[]>({
    queryKey: ['fritz-devices'],
    queryFn: () => client.get('/fritz/devices').then(r => r.data),
  });

  useEffect(() => {
    if (config) {
      setHost(config.host || '');
      setUsername(config.username || '');
      setSyncEnabled(config.sync_enabled ?? true);
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true); setError(null); setStatusMsg(null);
    try {
      await client.post('/fritz/config', { host, username, password, sync_enabled: syncEnabled });
      setPassword('');
      setStatusMsg('FRITZ!Box configuration saved');
      await refetchConfig();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save configuration');
    } finally { setSaving(false); }
  };

  const handleSync = async () => {
    setSyncing(true); setError(null); setStatusMsg(null);
    try {
      const res = await client.post('/fritz/sync');
      setStatusMsg(res.data?.message || 'Sync completed');
      await refetchStatus();
    } catch (err: any) { setError(err.response?.data?.detail || 'Sync failed'); }
    finally { setSyncing(false); }
  };

  const handleSyncNetdev = async () => {
    setSyncingNetdev(true); setError(null); setStatusMsg(null);
    try {
      const res = await client.post('/fritz/sync/netdev');
      const r = res.data;
      setStatusMsg(`${r.message} — ${r.created_relationships} relationships, ${r.devices_processed} devices, ${r.health_updated} health updates`);
      await refetchStatus();
      await refetchDevices();
    } catch (err: any) { setError(err.response?.data?.detail || 'Mesh sync failed'); }
    finally { setSyncingNetdev(false); }
  };

  const handleSyncHosts = async () => {
    setSyncingHosts(true); setError(null); setStatusMsg(null);
    try {
      const res = await client.post('/fritz/sync/hosts');
      setStatusMsg(res.data?.message || 'Host sync completed');
      await refetchStatus();
    } catch (err: any) { setError(err.response?.data?.detail || 'Host sync failed'); }
    finally { setSyncingHosts(false); }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true); setError(null); setDiagnoseResult(null);
    try {
      const res = await client.get('/fritz/diagnose');
      setDiagnoseResult(res.data);
    } catch (err: any) { setError(err.response?.data?.detail || 'Diagnose failed'); }
    finally { setDiagnosing(false); }
  };

  const handleReboot = async (ciId: string | null, label: string) => {
    if (!confirm(`Gerät "${label}" wirklich neu starten?\n\nDas Gerät ist für ca. 60–90 Sekunden nicht erreichbar.`)) return;
    setRebootingId(ciId ?? 'main');
    setError(null); setStatusMsg(null);
    try {
      const url = ciId ? `/fritz/reboot/${ciId}` : '/fritz/reboot';
      const res = await client.post(url);
      setStatusMsg(res.data?.message || `Reboot-Befehl gesendet an ${label}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || `Reboot von ${label} fehlgeschlagen`);
    } finally { setRebootingId(null); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">FRITZ!Box</h1>
          <p className="text-slate-400 text-sm">Mesh-Topologie und Geräteverwaltung</p>
        </div>
        <button onClick={() => { refetchConfig(); refetchStatus(); refetchDevices(); }} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}</div>}
      {statusMsg && <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">{statusMsg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Config */}
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Router className="w-4 h-4" /> Konfiguration
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
            <input type="password" className="input" placeholder="Leer lassen um beizubehalten" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSyncEnabled(!syncEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${syncEnabled ? 'bg-blue-500' : 'bg-slate-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${syncEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-xs text-slate-400">Mesh sync aktiviert</span>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
            <PlugZap className="w-4 h-4" /> {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>

        {/* Sync */}
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <PlayCircle className="w-4 h-4" /> Sync
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant={status?.configured ? 'success' : 'warning'}>
              {status?.configured ? 'Konfiguriert' : 'Nicht konfiguriert'}
            </Badge>
            {status?.last_sync && (
              <span className="text-xs text-slate-400">Letzter Sync: {new Date(status.last_sync).toLocaleString()}</span>
            )}
          </div>
          {status?.last_sync_result && (
            <div className="text-xs text-slate-500 font-mono bg-slate-800/50 rounded p-2 max-h-24 overflow-auto">
              {status.last_sync_result}
            </div>
          )}
          <div className="space-y-2">
            <button onClick={handleSyncNetdev} disabled={syncingNetdev} className="btn-primary text-sm flex items-center gap-2 w-full">
              <Network className="w-4 h-4" />
              {syncingNetdev ? 'Syncing...' : 'Mesh Sync via netDev (empfohlen)'}
            </button>
            <p className="text-[10px] text-slate-500 -mt-1 ml-1">Gerät → Repeater → Fritz!Box Topologie</p>
            <button onClick={handleSyncHosts} disabled={syncingHosts} className="btn-secondary text-sm flex items-center gap-2 w-full">
              <PlayCircle className="w-4 h-4" /> {syncingHosts ? 'Syncing...' : 'Host Sync (alle Geräte → Router)'}
            </button>
            <button onClick={handleSync} disabled={syncing} className="btn-secondary text-sm flex items-center gap-2 w-full text-slate-500">
              <PlayCircle className="w-3.5 h-3.5" /> {syncing ? 'Syncing...' : 'Legacy Mesh Sync (meshlist)'}
            </button>
            <button onClick={handleDiagnose} disabled={diagnosing} className="btn-secondary text-sm flex items-center gap-2 w-full">
              <Stethoscope className="w-4 h-4" /> {diagnosing ? 'Diagnosing...' : 'Diagnose'}
            </button>
          </div>
        </div>
      </div>

      {/* Reboot Panel */}
      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Power className="w-4 h-4 text-amber-400" /> Gerät neu starten
          <span className="ml-auto text-[10px] text-slate-600 font-normal normal-case">
            Verwendet TR-064 DeviceConfig Reboot — gleiche Credentials wie oben
          </span>
        </h3>

        <div className="overflow-hidden rounded-lg border border-slate-800/60">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800/60">
                <th className="table-header">Gerät</th>
                <th className="table-header">IP</th>
                <th className="table-header">Typ</th>
                <th className="table-header">Status</th>
                <th className="table-header text-right pr-4">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {fritzDevices?.map(ci => (
                <tr key={ci.id} className="border-b border-slate-800/40 last:border-0">
                  <td className="table-cell font-medium text-slate-100">{ci.name}</td>
                  <td className="table-cell font-mono text-xs text-slate-400">{ci.ip_address || '—'}</td>
                  <td className="table-cell text-slate-500 text-xs">{TYPE_LABEL[ci.ci_type] ?? ci.ci_type}</td>
                  <td className="table-cell">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${
                      ci.health_status === 'healthy' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      ci.health_status === 'down' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        ci.health_status === 'healthy' ? 'bg-green-400' :
                        ci.health_status === 'down' ? 'bg-red-400' : 'bg-slate-500'
                      }`} />
                      {ci.health_status}
                    </span>
                  </td>
                  <td className="table-cell text-right pr-4">
                    <button
                      onClick={() => handleReboot(ci.id, ci.name)}
                      disabled={rebootingId === ci.id}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                        bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40
                        text-amber-400 hover:text-amber-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Power className="w-3 h-3" />
                      {rebootingId === ci.id ? 'Sendet...' : 'Reboot'}
                    </button>
                  </td>
                </tr>
              ))}
              {!fritzDevices?.length && (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-slate-600 text-sm">
                    Keine Router oder Access Points im Inventory gefunden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-600">
          <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-600" />
          Nach einem Reboot ist das Gerät ca. 60–90 Sekunden offline. Alle verbundenen Geräte verlieren kurz die Verbindung.
        </p>
      </div>

      {diagnoseResult && (
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Stethoscope className="w-4 h-4" /> Diagnose-Ergebnis
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">SID Login</div>
              <div className={diagnoseResult.sid_ok ? 'text-green-400 font-medium' : 'text-red-400'}>
                {diagnoseResult.sid_ok ? 'OK' : `Fehler: ${diagnoseResult.sid_error || 'unknown'}`}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded p-2">
              <div className="text-slate-500">TR-064 Hosts</div>
              <div className={diagnoseResult.tr064_host_count > 0 ? 'text-green-400 font-medium' : 'text-amber-400'}>
                {diagnoseResult.tr064_error ? `Fehler: ${diagnoseResult.tr064_error}` : `${diagnoseResult.tr064_host_count ?? '—'} Geräte`}
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
              {diagnoseResult.nodes != null && <div className="text-slate-400">{diagnoseResult.nodes} nodes</div>}
            </div>
          </div>
          {diagnoseResult.tr064_host_preview?.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Host preview (erste 3 via TR-064):</div>
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
        </div>
      )}
    </div>
  );
}
