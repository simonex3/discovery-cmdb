import { ReactNode, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compass, Search, Wifi } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import client from '../../api/client';

const TYPE_COLOR: Record<string, string> = {
  server: '#2563eb', router: '#059669', switch: '#0d9488', access_point: '#0891b2',
  nas: '#7c3aed', vm: '#ca8a04', container: '#ea580c', desktop: '#475569', laptop: '#475569',
  mobile: '#0284c7', iot: '#4d7c0f', other: '#475569',
};

function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch results
  const { data } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: () =>
      client.get('/cis', { params: { search: debouncedQuery, page_size: 8 } }).then(r => r.data),
    enabled: debouncedQuery.trim().length > 0,
  });

  const results = (data?.items ?? []).slice(0, 6);

  useEffect(() => {
    if (debouncedQuery.trim().length === 0) {
      setOpen(false);
    } else if (results.length > 0) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [debouncedQuery, results.length]);

  // Ctrl+K / Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Escape to close
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (ci: any) => {
    navigate(`/inventory/${ci.id}`);
    setQuery('');
    setDebouncedQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-64">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (debouncedQuery.trim() && results.length > 0) setOpen(true); }}
        placeholder="Search CIs... (Ctrl+K)"
        className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg pl-7 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:bg-slate-800 transition-colors"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl z-50 overflow-hidden">
          {results.map((ci: any) => {
            const color = TYPE_COLOR[ci.ci_type] ?? TYPE_COLOR.other;
            return (
              <button
                key={ci.id}
                onMouseDown={() => handleSelect(ci)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800/80 text-left transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="flex-1 min-w-0">
                  <span className="text-xs text-slate-200 font-medium truncate block">{ci.name}</span>
                  {ci.ip_address && (
                    <span className="text-[10px] font-mono text-slate-500">{ci.ip_address}</span>
                  )}
                </span>
                <span className="text-[9px] text-slate-500 bg-slate-800 border border-slate-700/50 px-1.5 py-0.5 rounded flex-shrink-0">
                  {ci.ci_type}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
    <header className="h-11 flex items-center justify-between px-5 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-sm flex-shrink-0 gap-4">
      {/* Left: subnet info */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Wifi className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-xs text-slate-600 font-mono">192.168.178.0/24</span>
      </div>

      {/* Center: global search */}
      <div className="flex-1 flex justify-center">
        <GlobalSearch />
      </div>

      {/* Right: status indicators + version */}
      <div className="flex items-center gap-4 flex-shrink-0">
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
