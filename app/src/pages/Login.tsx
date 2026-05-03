import { useState, FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function Login() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email.trim(), password)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="text-2xl font-bold text-text1 tracking-tight">Sanders Intelligence</div>
          <div className="text-text2 text-sm mt-1">Inventory & Operations Dashboard</div>
        </div>

        {/* Card */}
        <div className="card">
          <h1 className="text-base font-semibold text-text1 mb-5">Sign in</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Email</label>
              <input
                type="email"
                required
                className="input w-full"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Password</label>
              <input
                type="password"
                required
                className="input w-full"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
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
              {loading ? <LoadingSpinner size="sm" /> : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-text2 mt-4">
          Contact your administrator to get access.
        </p>
      </div>
    </div>
  )
}
