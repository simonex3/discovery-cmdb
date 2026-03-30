import clsx from 'clsx';

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-slate-700 text-slate-300',
  success: 'bg-green-500/15 text-green-400 border border-green-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  error: 'bg-red-500/15 text-red-400 border border-red-500/20',
  info: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
};

interface Props {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

export function Badge({ children, variant = 'default', className }: Props) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', VARIANTS[variant], className)}>
      {children}
    </span>
  );
}

export function healthBadge(status: string) {
  const map: Record<string, Variant> = { healthy: 'success', degraded: 'warning', down: 'error', unknown: 'default' };
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>;
}

export function statusBadge(status: string) {
  const map: Record<string, Variant> = { active: 'success', inactive: 'default', maintenance: 'warning', retired: 'error' };
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>;
}
