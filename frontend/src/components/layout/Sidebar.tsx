import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Network, Database, Radar, ExternalLink,
  ScrollText, Settings, Users, LogOut, ChevronLeft, ChevronRight, Router,
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
      { to: '/topology', icon: Network, label: 'Topology' },
      { to: '/inventory', icon: Database, label: 'Inventory' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/discovery', icon: Radar, label: 'Discovery' },
      { to: '/fritz', icon: Router, label: 'FRITZ!Box' },
      { to: '/servicenow', icon: ExternalLink, label: 'ServiceNow' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/audit', icon: ScrollText, label: 'Audit Log' },
      { to: '/users', icon: Users, label: 'Users' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('cmdb_token');
    window.location.href = '/';
  };

  return (
    <aside className={clsx(
      'flex flex-col border-r border-slate-800/80 transition-all duration-200 h-screen sticky top-0 flex-shrink-0',
      collapsed ? 'w-14' : 'w-56',
    )}
      style={{ background: 'linear-gradient(180deg, #0a0f1e 0%, #080d1a 100%)' }}
    >
      {/* Logo */}
      <div className={clsx(
        'flex items-center gap-3 px-4 py-4 border-b border-slate-800/80',
        collapsed && 'justify-center px-0'
      )}>
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30">
          <Network className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-bold text-white text-sm leading-tight tracking-tight">Discovery</div>
            <div className="text-[10px] font-bold uppercase tracking-widest"
              style={{ background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              CMDB
            </div>
          </div>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-1">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, exact }) => {
                const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 relative',
                      collapsed && 'justify-center px-0 w-10 mx-auto',
                      isActive
                        ? 'text-white'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    )}
                    title={collapsed ? label : undefined}
                    style={isActive ? {
                      background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(109,40,217,0.15))',
                      borderLeft: collapsed ? 'none' : '2px solid #3b82f6',
                      paddingLeft: collapsed ? undefined : '10px',
                    } : undefined}
                  >
                    <Icon className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-blue-400' : '')} />
                    {!collapsed && <span className="truncate">{label}</span>}
                    {isActive && !collapsed && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-slate-800/80 p-2 space-y-0.5">
        <button
          onClick={handleLogout}
          className={clsx(
            'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={clsx(
            'flex items-center gap-3 w-full px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-400 hover:bg-slate-800/40 transition-all duration-150',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <><ChevronLeft className="w-3.5 h-3.5" /><span>Collapse</span></>
          }
        </button>
      </div>
    </aside>
  );
}
