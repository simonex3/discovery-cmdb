import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import type { CI, PaginatedResponse } from '../types';
import StatusDot from '../components/ui/StatusDot';
import { healthBadge, statusBadge } from '../components/ui/Badge';

const TYPE_COLORS: Record<string, string> = {
  server:       'bg-blue-500',
  router:       'bg-violet-500',
  switch:       'bg-indigo-500',
  access_point: 'bg-cyan-500',
  firewall:     'bg-red-500',
  nas:          'bg-amber-500',
  vm:           'bg-emerald-500',
  container:    'bg-teal-500',
  service:      'bg-sky-500',
  database:     'bg-orange-500',
  desktop:      'bg-blue-400',
  laptop:       'bg-slate-400',
  mobile:       'bg-pink-500',
  iot:          'bg-lime-500',
  printer:      'bg-stone-400',
  other:        'bg-slate-500',
};

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? 'bg-slate-500';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      <span className="text-slate-400 capitalize text-sm">{type}</span>
    </span>
  );
}

const ALL_TYPES = ['server','router','switch','access_point','nas','vm','container','service','database','desktop','laptop','mobile','iot','firewall','printer','other'];

export default function Inventory() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<PaginatedResponse<CI>>({
    queryKey: ['cis', search, typeFilter, page],
    queryFn: () => client.get('/cis', { params: { search: search||undefined, ci_type: typeFilter||undefined, page, page_size: 20 } }).then(r => r.data),
  });

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

  const totalPages = data?.pages ?? 1;

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

      {/* Search + Refresh row */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9 w-64"
            placeholder="Search name, IP, hostname..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setTypeFilter(''); setPage(1); }}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
            typeFilter === ''
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-transparent border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-300'
          }`}
        >
          All
        </button>
        {ALL_TYPES.map(t => (
          <button
            key={t}
            onClick={() => { setTypeFilter(t); setPage(1); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              typeFilter === t
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-transparent border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-300'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${typeFilter === t ? 'bg-white' : (TYPE_COLORS[t] ?? 'bg-slate-500')}`} />
            {t.replace('_', ' ')}
          </button>
        ))}
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
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TYPE_COLORS[ci.ci_type] ?? 'bg-slate-500'}`} />
                    <div>
                      <p className="font-medium text-slate-100">{ci.name}</p>
                      {ci.hostname && <p className="text-xs text-slate-500">{ci.hostname}</p>}
                    </div>
                  </div>
                </td>
                <td className="table-cell">
                  <TypeBadge type={ci.ci_type} />
                </td>
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

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-xs text-slate-500">
              Page <span className="text-slate-300 font-medium">{page}</span> of <span className="text-slate-300 font-medium">{totalPages}</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
