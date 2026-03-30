import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, ScrollText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import type { AuditLog as AuditLogType, PaginatedResponse } from '../types';

interface AuditResponse extends PaginatedResponse<AuditLogType> {}

export default function AuditLog() {
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<AuditResponse>({
    queryKey: ['audit', action, actor, page],
    queryFn: () => client.get('/audit', { params: { action: action || undefined, actor: actor || undefined, page, page_size: 50 } }).then(r => r.data),
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-slate-400 text-sm">Changes and activity across the CMDB</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input className="input pl-9 w-48" placeholder="Action (e.g. created)" value={action} onChange={e => { setAction(e.target.value); setPage(1); }} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input className="input pl-9 w-48" placeholder="Actor" value={actor} onChange={e => { setActor(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-700/50">
            <tr>
              {['Time','Action','CI','Actor','Description'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">Loading...</td></tr>
            )}
            {data?.items?.map(log => (
              <tr key={log.id} className="table-row">
                <td className="table-cell text-xs text-slate-400">
                  {log.timestamp ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }) : '—'}
                </td>
                <td className="table-cell">
                  <span className="inline-flex items-center gap-2">
                    <ScrollText className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-200">{log.action}</span>
                  </span>
                </td>
                <td className="table-cell text-slate-300">{log.ci_name || '—'}</td>
                <td className="table-cell text-slate-300">{log.actor}</td>
                <td className="table-cell text-slate-400">{log.description || '—'}</td>
              </tr>
            ))}
            {data?.items?.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-500">No log entries</td></tr>
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
