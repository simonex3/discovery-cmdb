import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compass, Wifi } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Sidebar from './Sidebar';
import client from '../../api/client';

function TopBar() {
  const { data: status } = useQuery({
    queryKey: ['discovery-status-topbar'],
    queryFn: () => client.get('/discovery/status').then(r => r.data),
    refetchInterval: 3000,
    retry: false,
  });

  const running = status?.running === true;
  const completedAt: string | undefined = status?.completed_at;

  const lastScanLabel = (() => {
    if (!completedAt) return null;
    try {
      return `Last scan: ${formatDistanceToNow(new Date(completedAt), { addSuffix: true })}`;
    } catch {
      return null;
    }
  })();

  return (
    <header className="h-11 flex items-center justify-between px-5 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-sm flex-shrink-0">
      {/* Left: subnet info */}
      <div className="flex items-center gap-2">
        <Wifi className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-xs text-slate-600 font-mono">192.168.178.0/24</span>
      </div>

      {/* Right: status indicators + version */}
      <div className="flex items-center gap-4">
        {/* Discovery running indicator OR live dot */}
        {running ? (
          <div className="flex items-center gap-2 text-blue-400 text-xs font-medium animate-fade-in">
            <Compass className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '2s' }} />
            <span>Discovery running...</span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live</span>
          </div>
        )}

        {/* Last scan time */}
        {lastScanLabel && (
          <span className="text-[10px] text-slate-600 font-mono hidden sm:inline">
            {lastScanLabel}
          </span>
        )}

        {/* Version label — pushed further right by the gap */}
        <span className="text-[10px] text-slate-700 font-mono pl-2 border-l border-slate-800">
          Discovery CMDB v1.0
        </span>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
