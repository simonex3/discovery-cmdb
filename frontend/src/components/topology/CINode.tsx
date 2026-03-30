import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import type { TopologyNodeData } from '../../types';

const TYPE_STYLE: Record<string, { header: string; glow: string; label: string }> = {
  server:       { header: 'bg-blue-600',    glow: 'shadow-blue-900/40',   label: 'Server' },
  router:       { header: 'bg-emerald-600', glow: 'shadow-emerald-900/40',label: 'Router' },
  switch:       { header: 'bg-teal-600',    glow: 'shadow-teal-900/40',   label: 'Switch' },
  access_point: { header: 'bg-cyan-600',    glow: 'shadow-cyan-900/40',   label: 'AP' },
  firewall:     { header: 'bg-red-600',     glow: 'shadow-red-900/40',    label: 'Firewall' },
  nas:          { header: 'bg-violet-600',  glow: 'shadow-violet-900/40', label: 'NAS' },
  vm:           { header: 'bg-yellow-600',  glow: 'shadow-yellow-900/40', label: 'VM' },
  container:    { header: 'bg-orange-600',  glow: 'shadow-orange-900/40', label: 'Container' },
  service:      { header: 'bg-indigo-600',  glow: 'shadow-indigo-900/40', label: 'Service' },
  database:     { header: 'bg-pink-600',    glow: 'shadow-pink-900/40',   label: 'Database' },
  desktop:      { header: 'bg-slate-500',   glow: 'shadow-slate-900/40',  label: 'Desktop' },
  laptop:       { header: 'bg-slate-500',   glow: 'shadow-slate-900/40',  label: 'Laptop' },
  mobile:       { header: 'bg-sky-600',     glow: 'shadow-sky-900/40',    label: 'Mobile' },
  iot:          { header: 'bg-lime-700',    glow: 'shadow-lime-900/40',   label: 'IoT' },
  printer:      { header: 'bg-stone-600',   glow: 'shadow-stone-900/40',  label: 'Printer' },
  other:        { header: 'bg-slate-600',   glow: 'shadow-slate-900/40',  label: 'Other' },
};

const HEALTH_RING: Record<string, string> = {
  healthy:  'ring-1 ring-green-500/50',
  degraded: 'ring-1 ring-amber-500/50',
  down:     'ring-1 ring-red-500/30',
  unknown:  'ring-1 ring-slate-700/50',
};

const HEALTH_DOT: Record<string, string> = {
  healthy:  'bg-green-400',
  degraded: 'bg-amber-400',
  down:     'bg-red-500',
  unknown:  'bg-slate-500',
};

export default memo(function CINode({ data, selected }: NodeProps) {
  const d = data as unknown as TopologyNodeData;
  const ts = TYPE_STYLE[d.ci_type] ?? TYPE_STYLE.other;
  const ring = HEALTH_RING[d.health_status] ?? HEALTH_RING.unknown;
  const healthDot = HEALTH_DOT[d.health_status] ?? HEALTH_DOT.unknown;
  const isDown = d.health_status === 'down';

  return (
    <div className={clsx(
      'rounded-xl overflow-hidden shadow-lg min-w-[140px] max-w-[185px] transition-all duration-150',
      ring,
      ts.glow,
      selected && 'ring-2 ring-blue-400 ring-offset-1 ring-offset-slate-950',
      isDown ? 'opacity-50 grayscale' : 'hover:scale-[1.04] hover:shadow-xl',
    )}
      style={{ background: 'linear-gradient(145deg, #0f172a, #0a0f1e)' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-600 !border-slate-500 !w-2 !h-2 !opacity-0 group-hover:!opacity-100" />

      {/* Type header */}
      <div className={clsx('px-2.5 py-1.5 flex items-center justify-between gap-2', ts.header)}>
        <span className="text-[9px] font-bold text-white/90 uppercase tracking-widest truncate">{ts.label}</span>
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 shadow-lg', healthDot)} />
      </div>

      {/* Body */}
      <div className="px-2.5 py-2">
        <div className="text-[11px] font-semibold text-slate-100 truncate leading-snug" title={d.label}>
          {d.label}
        </div>
        {d.ip_address && (
          <div className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">{d.ip_address}</div>
        )}
        {d.environment && d.environment !== 'production' && (
          <div className="text-[9px] text-slate-600 mt-0.5 capitalize tracking-wide">{d.environment}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-600 !border-slate-500 !w-2 !h-2 !opacity-0 group-hover:!opacity-100" />
    </div>
  );
});
