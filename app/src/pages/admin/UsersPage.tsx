import { useState } from 'react'
import { useUsers, useInviteUser, useUpdateUser } from '@/hooks/useUsers'
import Modal from '@/components/ui/Modal'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { AppUser, UserRole } from '@/types'
import { UserPlus, CheckCircle, XCircle, Edit2 } from 'lucide-react'
import { fmtDate } from '@/lib/utils'

const ROLES: UserRole[]    = ['purchasing', 'csuite', 'admin']
const DEPARTMENTS          = ['purchasing', 'warehouse', 'marketing', 'operations', 'other']

export default function UsersPage() {
  const { data: users = [], isLoading } = useUsers()
  const inviteUser  = useInviteUser()
  const updateUser  = useUpdateUser()

  const [inviteModal, setInviteModal] = useState(false)
  const [editUser, setEditUser]       = useState<AppUser | null>(null)

  // Invite form state
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [role, setRole]     = useState<UserRole>('purchasing')
  const [dept, setDept]     = useState('purchasing')
  const [inviteError, setInviteError] = useState<string | null>(null)

  async function handleInvite() {
    if (!email || !name) { setInviteError('Email and name are required'); return }
    setInviteError(null)
    try {
      await inviteUser.mutateAsync({ email, name, role, department: dept || null })
      setInviteModal(false)
      setEmail(''); setName(''); setRole('purchasing'); setDept('purchasing')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite user')
    }
  }

  async function handleToggleActive(user: AppUser) {
    await updateUser.mutateAsync({ id: user.id, is_active: !user.is_active })
  }

  if (isLoading) return <PageLoader />

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-text1">User Management</h1>
          <p className="text-text2 text-sm mt-0.5">{users.length} users · {users.filter(u => u.is_active).length} active</p>
        </div>
        <button onClick={() => setInviteModal(true)} className="btn-primary">
          <UserPlus size={15} /> Invite User
        </button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td className="font-medium text-text1">{user.name}</td>
                <td className="text-text2 text-xs">{user.email}</td>
                <td>
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-accent/10 text-accent capitalize">
                    {user.role}
                  </span>
                </td>
                <td className="text-text2 text-xs capitalize">{user.department ?? '—'}</td>
                <td>
                  {user.is_active
                    ? <span className="flex items-center gap-1 text-success text-xs"><CheckCircle size={12} /> Active</span>
                    : <span className="flex items-center gap-1 text-text2 text-xs"><XCircle size={12} /> Inactive</span>
                  }
                </td>
                <td className="text-text2 text-xs">{fmtDate(user.created_at)}</td>
                <td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditUser(user)}
                      className="btn-ghost text-xs py-1 px-2"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(user)}
                      className={`text-xs py-1 px-2 btn ${user.is_active ? 'btn-danger' : 'btn-secondary'}`}
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      <Modal open={inviteModal} onClose={() => setInviteModal(false)} title="Invite User">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Full Name *</label>
            <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Email *</label>
            <input type="email" className="input w-full" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Role</label>
              <select className="select w-full" value={role} onChange={e => setRole(e.target.value as UserRole)}>
                {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Department</label>
              <select className="select w-full" value={dept} onChange={e => setDept(e.target.value)}>
                {DEPARTMENTS.map(d => <option key={d} value={d} className="capitalize">{d}</option>)}
              </select>
            </div>
          </div>
          {inviteError && (
            <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{inviteError}</div>
          )}
          <p className="text-[11px] text-text2">
            The user will receive an invite email and can set their password on first login.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setInviteModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleInvite} disabled={inviteUser.isPending} className="btn-primary">
              {inviteUser.isPending ? <LoadingSpinner size="sm" /> : 'Send Invite'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      {editUser && (
        <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit — ${editUser.name}`}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text2 mb-1.5">Role</label>
                <select
                  className="select w-full"
                  value={editUser.role}
                  onChange={e => setEditUser({ ...editUser, role: e.target.value as UserRole })}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text2 mb-1.5">Department</label>
                <select
                  className="select w-full"
                  value={editUser.department ?? ''}
                  onChange={e => setEditUser({ ...editUser, department: e.target.value })}
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditUser(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={async () => {
                  await updateUser.mutateAsync({ id: editUser.id, role: editUser.role, department: editUser.department })
                  setEditUser(null)
                }}
                disabled={updateUser.isPending}
                className="btn-primary"
              >
                {updateUser.isPending ? <LoadingSpinner size="sm" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
