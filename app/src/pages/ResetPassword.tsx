import { useState, FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ResetPassword() {
  const navigate  = useNavigate()
  const isInvite  = new URLSearchParams(window.location.search).get('mode') === 'invite'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-bold text-text1 tracking-tight">Sanders Intelligence</div>
          <div className="text-text2 text-sm mt-1">
            {isInvite ? 'Welcome — create your password to get started' : 'Set your new password'}
          </div>
        </div>

        <div className="card">
          <h1 className="text-base font-semibold text-text1 mb-5">
            {isInvite ? 'Create your password' : 'Reset password'}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">
                {isInvite ? 'Choose a password' : 'New password'}
              </label>
              <input
                type="password"
                required
                minLength={8}
                className="input w-full"
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Confirm password</label>
              <input
                type="password"
                required
                className="input w-full"
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading
                ? <LoadingSpinner size="sm" />
                : isInvite ? 'Create password & sign in' : 'Set password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
