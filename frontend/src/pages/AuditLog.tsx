import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import type { AuditLog as AuditLogType, PaginatedResponse } from '../types';

interface AuditResponse extends PaginatedResponse<AuditLogType> {}

const ACTION_STYLE: Record<string, string> = {
  discovered:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  created:        'bg-green-500/15 text-green-400 border-green-500/30',
  updated:        'bg-amber-500/15 text-amber-400 border-amber-500/30',
  deleted:        'bg-red-500/15 text-red-400 border-red-500/30',
  health_changed: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  rel_created:    'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

export default function AuditLog() {
  const navigate = useNavigate();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<AuditResponse>({
    queryKey: ['audit', action, actor, fromDate, toDate, page],
    queryFn: () => client.get('/audit', {
      params: {
        action: action || undefined,
        actor: actor || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        page,
        page_size: 50,
      },
    }).then(r => r.data),
  });

  const resetFilters = () => {
    setAction(''); setActor(''); setFromDate(''); setToDate(''); setPage(1);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-slate-400 text-sm">{data?.total ?? 0} entries</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-3 items-end">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input className="input pl-9 w-44 text-sm" placeholder="Action..." value={action}
            onChange={e => { setAction(e.target.value); setPage(1); }} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input className="input pl-9 w-40 text-sm" placeholder="Actor..." value={actor}
            onChange={e => { setActor(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">From</label>
          <input type="date" className="input w-36 text-sm" value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">To</label>
          <input type="date" className="input w-36 text-sm" value={toDate}
            onChange={e => { setToDate(e.target.value); setPage(1); }} />
        </div>
        {(action || actor || fromDate || toDate) && (
          <button onClick={resetFilters} className="btn-ghost text-xs">Clear filters</button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-700/50">
            <tr>
              {['Time', 'Action', 'CI', 'Actor', 'Description'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">Loading...</td></tr>
            )}
            {data?.items?.map(log => (
              <tr key={log.id}
                className={`table-row ${log.ci_id ? 'cursor-pointer' : ''}`}
                onClick={() => log.ci_id && navigate(`/inventory/${log.ci_id}`)}>
                <td className="table-cell text-xs text-slate-400 whitespace-nowrap">
                  {log.timestamp ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }) : '—'}
                </td>
                <td className="table-cell">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ACTION_STYLE[log.action] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                    {log.action}
                  </span>
                </td>
                <td className="table-cell">
                  {log.ci_name ? (
                    <span className="text-blue-400 hover:text-blue-300 text-sm underline underline-offset-2">
                      {log.ci_name}
                    </span>
                  ) : '—'}
                </td>
                <td className="table-cell text-slate-400 text-sm">{log.actor}</td>
                <td className="table-cell text-slate-500 text-xs max-w-xs truncate">{log.description || '—'}</td>
              </tr>
            ))}
            {data?.items?.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-500">No log entries</td></tr>
            )}
          </tbody>
        </table>

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <span className="text-xs text-slate-500">Page {page} of {data.pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="btn-secondary text-sm flex items-center gap-1 px-2 py-1 disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages}
                className="btn-secondary text-sm flex items-center gap-1 px-2 py-1 disabled:opacity-40">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
