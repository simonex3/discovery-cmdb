import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, RefreshCw, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import type { CI, PaginatedResponse } from '../types';
import StatusDot from '../components/ui/StatusDot';
import { healthBadge, statusBadge } from '../components/ui/Badge';

const TYPE_ICONS: Record<string,string> = {server:'🖥️',router:'📡',switch:'🔀',access_point:'📶',firewall:'🔒',nas:'💾',vm:'⚡',container:'📦',service:'⚙️',database:'🗄️',desktop:'🖥️',laptop:'💻',mobile:'📱',iot:'🔌',printer:'🖨️',other:'❓'};

export default function Inventory() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<PaginatedResponse<CI>>({
    queryKey: ['cis', search, typeFilter, page],
    queryFn: () => client.get('/cis', { params: { search: search||undefined, ci_type: typeFilter||undefined, page, page_size: 20 } }).then(r => r.data),
  });

  const types = ['server','router','switch','nas','vm','container','service','desktop','iot','other'];

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const res = await client.get('/cis/export', { params: { format }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cmdb_export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CI Inventory</h1>
          <p className="text-slate-400 text-sm">{data?.total ?? 0} configuration items</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport('json')} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> JSON
          </button>
          <button onClick={() => handleExport('csv')} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => navigate('/inventory/new')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add CI
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input className="input pl-9 w-64" placeholder="Search name, IP, hostname..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="select w-40" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-700/50">
            <tr>
              {['Name','Type','IP Address','Status','Health','OS','Last Seen'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading...</td></tr>
            )}
            {data?.items?.map(ci => (
              <tr key={ci.id} className="table-row" onClick={() => navigate(`/inventory/${ci.id}`)}>
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <span>{TYPE_ICONS[ci.ci_type] ?? '❓'}</span>
                    <div>
                      <p className="font-medium text-slate-100">{ci.name}</p>
                      {ci.hostname && <p className="text-xs text-slate-500">{ci.hostname}</p>}
                    </div>
                  </div>
                </td>
                <td className="table-cell text-slate-400 capitalize">{ci.ci_type}</td>
                <td className="table-cell font-mono text-xs text-slate-300">{ci.ip_address || '—'}</td>
                <td className="table-cell">{statusBadge(ci.status)}</td>
                <td className="table-cell">
                  <div className="flex items-center gap-2"><StatusDot status={ci.health_status} />{healthBadge(ci.health_status)}</div>
                </td>
                <td className="table-cell text-slate-400 text-xs">{ci.os || '—'}</td>
                <td className="table-cell text-xs text-slate-400">
                  {ci.last_seen ? formatDistanceToNow(new Date(ci.last_seen), { addSuffix: true }) : '—'}
                </td>
              </tr>
            ))}
            {data?.items?.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-slate-500">No CIs found</td></tr>
            )}
          </tbody>
        </table>
        {data && data.pages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-slate-700/50">
            {Array.from({length: data.pages}, (_, i) => i+1).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded text-sm ${page===p ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}>{p}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
