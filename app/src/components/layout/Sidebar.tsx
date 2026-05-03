import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard, Package, Truck, BarChart3,
  CheckSquare, Users, Upload, Building2, LogOut,
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

  // C-Suite
  { to: '/executive',              label: 'Executive Summary', icon: <BarChart3 size={16} />,  roles: ['admin', 'csuite'], group: 'C-Suite' },
  { to: '/executive/departments',  label: 'Departments',       icon: <Building2 size={16} />, roles: ['admin', 'csuite'], group: 'C-Suite' },

  // Shared
  { to: '/tasks', label: 'Tasks', icon: <CheckSquare size={16} />, roles: ['admin', 'purchasing', 'csuite'], group: 'Work' },

  // Admin
  { to: '/admin/users',   label: 'Users',   icon: <Users size={16} />,  roles: ['admin'], group: 'Admin' },
  { to: '/admin/uploads', label: 'Uploads', icon: <Upload size={16} />, roles: ['admin', 'purchasing'], group: 'Admin' },
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  if (!profile) return null

  const visible = NAV.filter(item => item.roles.includes(profile.role))

  // Group the nav items
  const groups = visible.reduce<Record<string, NavItem[]>>((acc, item) => {
    const g = item.group ?? 'Other'
    ;(acc[g] ||= []).push(item)
    return acc
  }, {})

  return (
    <aside className="w-56 flex-shrink-0 bg-surface border-r border-border flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-border">
        <div className="text-base font-bold text-text1 tracking-tight">Sanders</div>
        <div className="text-xs text-text2 mt-0.5">Intelligence</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text2 px-2 mb-1.5">
              {group}
            </div>
            {items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium mb-0.5 transition-colors',
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text2 hover:text-text1 hover:bg-surface2'
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-border px-4 py-3">
        <div className="text-xs text-text1 font-medium truncate">{profile.name}</div>
        <div className="text-[11px] text-text2 capitalize mt-0.5">{profile.role}</div>
        <button
          onClick={signOut}
          className="mt-2.5 flex items-center gap-1.5 text-[12px] text-text2 hover:text-danger transition-colors"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  )
}
