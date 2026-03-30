import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Server, CheckCircle, AlertTriangle, XCircle, Activity, Network, Plus, Edit2, Trash2, Search, Download, Upload, RefreshCw, FileText } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import type { Stats } from '../types';
import StatusDot from '../components/ui/StatusDot';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16'];

type ActionConfig = { label: string; color: string; icon: React.ReactNode };

const ACTION_CONFIG: Record<string, ActionConfig> = {
  created:        { label: 'Created',        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: <Plus className="w-3 h-3" /> },
  updated:        { label: 'Updated',        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',         icon: <Edit2 className="w-3 h-3" /> },
  deleted:        { label: 'Deleted',        color: 'text-red-400 bg-red-500/10 border-red-500/20',             icon: <Trash2 className="w-3 h-3" /> },
  discovered:     { label: 'Discovered',     color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',    icon: <Search className="w-3 h-3" /> },
  health_changed: { label: 'Health',         color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',       icon: <Activity className="w-3 h-3" /> },
  imported:       { label: 'Imported',       color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',          icon: <Download className="w-3 h-3" /> },
  exported:       { label: 'Exported',       color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',          icon: <Upload className="w-3 h-3" /> },
  synced:         { label: 'Synced',         color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',    icon: <RefreshCw className="w-3 h-3" /> },
  default:        { label: 'Event',          color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',       icon: <FileText className="w-3 h-3" /> },
};

const CARD_GRADIENTS: Record<string, string> = {
  blue:  'from-blue-600/10 to-transparent',
  green: 'from-emerald-600/10 to-transparent',
  amber: 'from-amber-600/10 to-transparent',
  red:   'from-red-600/10 to-transparent',
};

const CARD_ACCENTS: Record<string, string> = {
  blue:  'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red:   'bg-red-500',
};

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => client.get('/stats').then(r => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Activity className="w-5 h-5 animate-spin mr-2" /> Loading dashboard...
    </div>
  );

  const healthy = stats?.by_health?.healthy ?? 0;
  const down = stats?.by_health?.down ?? 0;
  const degraded = stats?.by_health?.degraded ?? 0;
  const total = stats?.total_cis ?? 0;

  const typeData = Object.entries(stats?.by_type ?? {}).map(([k, v]) => ({ name: k, value: v }));
  const healthData = Object.entries(stats?.by_health ?? {}).map(([k, v]) => ({ name: k, value: v }));
  const envData = Object.entries(stats?.by_environment ?? {}).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">Home network CMDB overview</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <Network className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs text-slate-400 font-mono">network overview</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total CIs', value: total, icon: Server, color: 'blue', sub: 'Configuration Items' },
          { label: 'Healthy', value: healthy, icon: CheckCircle, color: 'green', sub: `${total > 0 ? Math.round(healthy/total*100) : 0}% of total` },
          { label: 'Degraded', value: degraded, icon: AlertTriangle, color: 'amber', sub: 'Need attention' },
          { label: 'Down', value: down, icon: XCircle, color: 'red', sub: 'Unreachable' },
        ].map(card => (
          <div
            key={card.label}
            className={`relative overflow-hidden rounded-xl border border-slate-700/50 bg-gradient-to-br ${CARD_GRADIENTS[card.color]} bg-slate-900 flex items-start justify-between p-4`}
          >
            {/* Left accent strip */}
            <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${CARD_ACCENTS[card.color]}`} />

            <div className="pl-3">
              <p className="text-slate-400 text-sm">{card.label}</p>
              <p className="text-4xl font-bold text-white mt-1 leading-none">{card.value}</p>
              <p className="text-xs text-slate-500 mt-2">{card.sub}</p>
            </div>
            <div className={`p-2.5 rounded-xl bg-${card.color}-500/10 border border-${card.color}-500/20 flex-shrink-0`}>
              <card.icon className={`w-5 h-5 text-${card.color}-400`} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By Type Pie */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">CIs by Type</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={typeData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {typeData.slice(0, 5).map((d, i) => (
              <div key={d.name} className="flex justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-slate-400 capitalize">{d.name}</span>
                </span>
                <span className="text-slate-300 font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Health Bar */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Health Status</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={healthData} layout="vertical">
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={65} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {healthData.map((d, i) => {
                  const colors: Record<string,string> = { healthy: '#22c55e', degraded: '#f59e0b', down: '#ef4444', unknown: '#64748b' };
                  return <Cell key={i} fill={colors[d.name] ?? '#64748b'} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Environment */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">By Environment</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={envData}>
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Issues */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Active Issues
          </h3>
          {!stats?.issues?.length ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <CheckCircle className="w-8 h-8 text-emerald-500/50" />
              <p className="text-slate-500 text-sm">No issues detected</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.issues.map(ci => (
                <button
                  key={ci.id}
                  onClick={() => navigate(`/inventory/${ci.id}`)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/60 border border-transparent hover:border-slate-600/50 transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <StatusDot status={ci.health_status} />
                    <div>
                      <p className="text-sm text-slate-200 group-hover:text-white transition-colors">{ci.name}</p>
                      <p className="text-xs text-slate-500">{ci.ip_address} · {ci.ci_type}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ci.health_status === 'down' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {ci.health_status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" /> Recent Activity
          </h3>
          <div className="space-y-2.5">
            {stats?.recent_changes?.slice(0, 8).map(log => {
              const cfg = ACTION_CONFIG[log.action] ?? ACTION_CONFIG.default;
              return (
                <div key={log.id} className="flex items-start gap-2.5 text-sm">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold flex-shrink-0 mt-0.5 ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-300 truncate">{log.description || log.action}</p>
                    <p className="text-xs text-slate-500">
                      {log.actor} · {log.timestamp ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
