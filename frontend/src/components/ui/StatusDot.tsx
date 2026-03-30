import clsx from 'clsx';

const COLORS: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
  unknown: 'bg-slate-500',
};

const PULSE: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
  unknown: '',
};

interface Props { status: string; size?: 'sm' | 'md'; }

export default function StatusDot({ status, size = 'sm' }: Props) {
  const sz = size === 'md' ? 'w-3 h-3' : 'w-2 h-2';
  const pingColor = PULSE[status];
  const dotColor = COLORS[status] ?? 'bg-slate-500';

  return (
    <span className="relative inline-flex">
      {pingColor && status !== 'unknown' && (
        <span className={clsx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-50', pingColor)} />
      )}
      <span className={clsx('relative inline-flex rounded-full', sz, dotColor)} />
    </span>
  );
}
