import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import type { TopologyNodeData } from '../../types';

const TYPE_STYLE: Record<string, { header: string; dot: string; label: string }> = {
  server:       { header: 'bg-blue-600',    dot: 'bg-blue-400',    label: 'Server' },
  router:       { header: 'bg-emerald-600', dot: 'bg-emerald-400', label: 'Router' },
  switch:       { header: 'bg-teal-600',    dot: 'bg-teal-400',    label: 'Switch' },
  access_point: { header: 'bg-cyan-600',    dot: 'bg-cyan-400',    label: 'AP' },
  firewall:     { header: 'bg-red-600',     dot: 'bg-red-400',     label: 'Firewall' },
  nas:          { header: 'bg-violet-600',  dot: 'bg-violet-400',  label: 'NAS' },
  vm:           { header: 'bg-yellow-600',  dot: 'bg-yellow-400',  label: 'VM' },
  container:    { header: 'bg-orange-600',  dot: 'bg-orange-400',  label: 'Container' },
  service:      { header: 'bg-indigo-600',  dot: 'bg-indigo-400',  label: 'Service' },
  database:     { header: 'bg-pink-600',    dot: 'bg-pink-400',    label: 'Database' },
  desktop:      { header: 'bg-slate-600',   dot: 'bg-slate-400',   label: 'Desktop' },
  laptop:       { header: 'bg-slate-500',   dot: 'bg-slate-300',   label: 'Laptop' },
  mobile:       { header: 'bg-sky-600',     dot: 'bg-sky-400',     label: 'Mobile' },
  iot:          { header: 'bg-lime-700',    dot: 'bg-lime-400',    label: 'IoT' },
  printer:      { header: 'bg-stone-600',   dot: 'bg-stone-400',   label: 'Printer' },
  other:        { header: 'bg-slate-700',   dot: 'bg-slate-500',   label: 'Other' },
};

const HEALTH_RING: Record<string, string> = {
  healthy:  'ring-1 ring-green-500/60',
  degraded: 'ring-1 ring-amber-500/60',
  down:     'ring-1 ring-red-500/60',
  unknown:  'ring-1 ring-slate-600/60',
};

const HEALTH_DOT: Record<string, string> = {
  healthy:  'bg-green-400',
  degraded: 'bg-amber-400',
  down:     'bg-red-400',
  unknown:  'bg-slate-500',
};

export default memo(function CINode({ data, selected }: NodeProps) {
  const d = data as unknown as TopologyNodeData;
  const ts = TYPE_STYLE[d.ci_type] ?? TYPE_STYLE.other;
  const ring = HEALTH_RING[d.health_status] ?? HEALTH_RING.unknown;
  const healthDot = HEALTH_DOT[d.health_status] ?? HEALTH_DOT.unknown;

  return (
    <div className={clsx(
      'rounded-lg overflow-hidden shadow-xl bg-slate-900 min-w-[140px] max-w-[180px] transition-transform',
      ring,
      selected && 'ring-2 ring-blue-400',
      'hover:scale-[1.03]',
    )}>
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !border-slate-400 !w-2 !h-2" />

      {/* Type header bar */}
      <div className={clsx('px-2.5 py-1 flex items-center justify-between', ts.header)}>
        <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">{ts.label}</span>
        <span className={clsx('w-2 h-2 rounded-full', healthDot)} title={d.health_status} />
      </div>

      {/* Body */}
      <div className="px-2.5 py-2">
        <div className="text-xs font-semibold text-slate-100 truncate leading-tight" title={d.label}>
          {d.label}
        </div>
        {d.ip_address && (
          <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{d.ip_address}</div>
        )}
        {d.environment && d.environment !== 'production' && (
          <div className="text-[9px] text-slate-600 mt-0.5 capitalize">{d.environment}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !border-slate-400 !w-2 !h-2" />
    </div>
  );
});
