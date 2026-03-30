import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Network, Database, Radar, ExternalLink,
  ScrollText, Settings, Users, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/topology', icon: Network, label: 'Topology' },
  { to: '/inventory', icon: Database, label: 'CI Inventory' },
  { to: '/discovery', icon: Radar, label: 'Discovery' },
  { to: '/servicenow', icon: ExternalLink, label: 'ServiceNow' },
  { to: '/fritz', icon: Network, label: 'FRITZ!Box' },
  { to: '/audit', icon: ScrollText, label: 'Audit Log' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/settings', icon: Settings, label: 'Settings' },
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
      'flex flex-col bg-slate-900 border-r border-slate-700/50 transition-all duration-200 h-screen sticky top-0',
      collapsed ? 'w-16' : 'w-56'
    )}>
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5 border-b border-slate-700/50', collapsed && 'justify-center px-0')}>
        <span className="text-2xl flex-shrink-0">🖧</span>
        {!collapsed && (
          <div>
            <div className="font-bold text-white text-sm leading-tight">Discovery</div>
            <div className="text-blue-400 text-xs font-semibold">CMDB</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, exact }) => {
          const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && label}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-slate-700/50 p-2 space-y-1">
        <button
          onClick={handleLogout}
          className={clsx(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && 'Logout'}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={clsx(
            'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
        </button>

        {!collapsed && (
          <div className="px-3 pb-1 text-xs text-slate-600">v1.0.0</div>
        )}
      </div>
    </aside>
  );
}
