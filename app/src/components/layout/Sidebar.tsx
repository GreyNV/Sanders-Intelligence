import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard, Package, Truck, BarChart3,
  CheckSquare, Users, Upload, Building2, LogOut, Store,
  PanelLeftClose, PanelLeftOpen, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  roles: string[]
  group?: string
}

const NAV: NavItem[] = [
  // Purchasing
  { to: '/purchasing/action-center', label: 'Action Center',     icon: <LayoutDashboard size={16} />, roles: ['admin', 'purchasing'], group: 'Purchasing' },
  { to: '/purchasing/inventory',     label: 'Inventory Browser', icon: <Package size={16} />,          roles: ['admin', 'purchasing'], group: 'Purchasing' },
  { to: '/purchasing/inbound',       label: 'Inbound Pipeline',  icon: <Truck size={16} />,            roles: ['admin', 'purchasing'], group: 'Purchasing' },
  { to: '/purchasing/vendors',       label: 'Vendor View',       icon: <Store size={16} />,            roles: ['admin', 'purchasing'], group: 'Purchasing' },

  // C-Suite
  { to: '/executive',              label: 'Executive Summary', icon: <BarChart3 size={16} />,  roles: ['admin', 'csuite'], group: 'C-Suite' },
  { to: '/executive/departments',  label: 'Departments',       icon: <Building2 size={16} />, roles: ['admin', 'csuite'], group: 'C-Suite' },

  // Shared
  { to: '/daily', label: 'My Day', icon: <CalendarDays size={16} />, roles: ['admin', 'purchasing', 'csuite'], group: 'Work' },
  { to: '/tasks', label: 'Tasks', icon: <CheckSquare size={16} />, roles: ['admin', 'purchasing', 'csuite'], group: 'Work' },

  // Admin
  { to: '/admin/users',   label: 'Users',   icon: <Users size={16} />,  roles: ['admin'], group: 'Admin' },
  { to: '/admin/uploads', label: 'Uploads', icon: <Upload size={16} />, roles: ['admin', 'purchasing'], group: 'Admin' },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ui.sidebar.collapsed') === 'true')
  if (!profile) return null

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const visible = NAV.filter(item => item.roles.includes(profile.role))
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  // Group the nav items
  const groups = visible.reduce<Record<string, NavItem[]>>((acc, item) => {
    const g = item.group ?? 'Other'
    ;(acc[g] ||= []).push(item)
    return acc
  }, {})

  function toggleCollapsed() {
    setCollapsed(value => {
      const next = !value
      localStorage.setItem('ui.sidebar.collapsed', String(next))
      return next
    })
  }

  return (
    <aside className={cn(
      'flex-shrink-0 bg-surface border-r border-border flex flex-col h-screen sticky top-0 transition-[width] duration-150 ease-out overflow-hidden',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Logo */}
      <div className={cn('border-b border-border flex items-center gap-2', collapsed ? 'px-2 py-4 justify-center' : 'px-5 py-4 justify-between')}>
        {collapsed ? (
          <div className="text-base font-bold text-text1 tracking-tight" title="Sanders Intelligence">S</div>
        ) : (
          <div className="min-w-0">
            <div className="text-base font-bold text-text1 tracking-tight">Sanders</div>
            <div className="text-xs text-text2 mt-0.5">Intelligence</div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="text-text2 hover:text-text1 transition-colors shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ToggleIcon size={15} />
        </button>
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-4">
            {!collapsed && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text2 px-2 mb-1.5">
                {group}
              </div>
            )}
            {items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-lg text-[13px] font-medium mb-0.5 transition-colors',
                    collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-2',
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text2 hover:text-text1 hover:bg-surface2'
                  )
                }
              >
                {item.icon}
                {!collapsed && item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className={cn('border-t border-border py-3', collapsed ? 'px-2 flex justify-center' : 'px-4')}>
        {!collapsed && (
          <>
            <div className="text-xs text-text1 font-medium truncate">{profile.name}</div>
            <div className="text-[11px] text-text2 capitalize mt-0.5">{profile.role}</div>
          </>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center text-[12px] text-text2 hover:text-danger transition-colors',
            collapsed ? 'justify-center' : 'mt-2.5 gap-1.5'
          )}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={13} /> {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
