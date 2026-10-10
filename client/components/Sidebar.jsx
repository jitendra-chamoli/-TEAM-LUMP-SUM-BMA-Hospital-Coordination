import React from 'react';
import { Dialog as RDialog } from 'radix-ui';
import {
  LayoutDashboard, Users, Settings, LogOut, ShieldAlert, Siren, History, Radio,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { cn, Tip, Avatar } from '../src/ui';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'staff', 'doctor'] },
  { id: 'emergency', label: 'Emergency dispatch', icon: Siren, roles: ['admin', 'staff'] },
  { id: 'control', label: 'Control room', icon: Radio, roles: ['admin', 'staff'] },
  { id: 'incidents', label: 'Incident log', icon: ShieldAlert, roles: ['admin', 'staff', 'doctor'] },
  { id: 'staff', label: 'Staff & roster', icon: Users, roles: ['admin'] },
  { id: 'activity', label: 'Activity', icon: History, roles: ['admin'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin', 'staff', 'doctor'] },
];

const ROLE_LABELS = { admin: 'Admin', staff: 'Staff', doctor: 'Doctor' };

const Brand = ({ collapsed }) => (
  <div className={cn('flex items-center gap-2.5 h-14 px-4 border-b border-line', collapsed && 'justify-center px-0')}>
    <div className="h-7 w-7 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">B</div>
    {!collapsed && (
      <div className="leading-tight min-w-0">
        <p className="text-sm font-semibold text-slate-900">BMA</p>
        <p className="text-[11px] text-slate-500">Hospital coordination</p>
      </div>
    )}
  </div>
);

const NavList = ({ items, activeTab, onSelect, collapsed }) => (
  <nav className="flex-1 overflow-y-auto p-2 space-y-0.5" aria-label="Main">
    {items.map(item => {
      const active = activeTab === item.id;
      const link = (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'w-full flex items-center gap-2.5 h-9 rounded-md text-sm font-medium transition-colors',
            collapsed ? 'justify-center px-0' : 'px-2.5',
            active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'
          )}
        >
          <item.icon size={17} className={active ? 'text-brand-600' : 'text-slate-400'} />
          {!collapsed && item.label}
        </button>
      );
      return collapsed ? <Tip key={item.id} content={item.label} side="right">{link}</Tip> : link;
    })}
  </nav>
);

// Who's signed in, plus Sign out. Settings is already in the nav, so it isn't repeated here.
const UserFooter = ({ user, collapsed, onLogout }) => (
  <div className={cn('p-2 border-t border-line flex items-center gap-2', collapsed && 'flex-col')}>
    <Tip content={collapsed ? `${user.name} · ${ROLE_LABELS[user.role]}` : null} side="right">
      <span className={cn('flex items-center gap-2.5 min-w-0 p-1.5', !collapsed && 'flex-1')}>
        <Avatar name={user.name} />
        {!collapsed && (
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-900 truncate">{user.name}</span>
            <span className="block text-xs text-slate-500 truncate">{ROLE_LABELS[user.role]}{user.department ? ` · ${user.department}` : ''}</span>
          </span>
        )}
      </span>
    </Tip>
    <Tip content="Sign out" side={collapsed ? 'right' : 'top'}>
      <button onClick={onLogout} aria-label="Sign out"
        className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
        <LogOut size={16} />
      </button>
    </Tip>
  </div>
);

// Desktop: fixed column that can collapse to icons. Mobile: slide-in drawer.
const Sidebar = ({ activeTab, setActiveTab, user, onLogout, collapsed, onToggleCollapsed, mobileOpen, onMobileOpenChange }) => {
  const items = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  const select = (id) => {
    setActiveTab(id);
    onMobileOpenChange(false);
  };

  return (
    <>
      <aside className={cn('hidden lg:flex flex-col shrink-0 h-screen sticky top-0 bg-white border-r border-line transition-[width] duration-200', collapsed ? 'w-16' : 'w-60')}>
        <Brand collapsed={collapsed} />
        <NavList items={items} activeTab={activeTab} onSelect={select} collapsed={collapsed} />
        <div className={cn('px-2 pb-1', collapsed && 'flex justify-center')}>
          <Tip content={collapsed ? 'Expand sidebar' : null} side="right">
            <button onClick={onToggleCollapsed}
              className={cn('flex items-center gap-2.5 h-8 rounded-md text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900', collapsed ? 'w-9 justify-center' : 'w-full px-2.5')}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /> Collapse</>}
            </button>
          </Tip>
        </div>
        <UserFooter user={user} collapsed={collapsed} onLogout={onLogout} />
      </aside>

      <RDialog.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <RDialog.Portal>
          <RDialog.Overlay className="lg:hidden fixed inset-0 z-50 bg-slate-900/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <RDialog.Content className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col bg-white shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
            <RDialog.Title className="sr-only">Navigation</RDialog.Title>
            <RDialog.Description className="sr-only">Main menu</RDialog.Description>
            <Brand />
            <NavList items={items} activeTab={activeTab} onSelect={select} />
            <UserFooter user={user} onLogout={onLogout} />
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>
    </>
  );
};

export default Sidebar;
