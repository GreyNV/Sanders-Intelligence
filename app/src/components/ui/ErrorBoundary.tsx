import { Component, ReactNode } from 'react'

interface Props  { children: ReactNode }
interface State  { hasError: boolean; error: Error | null }

/**
 * Global error boundary — catches unhandled render/lifecycle errors so the
 * entire app doesn't go white on a hard refresh or unexpected exception.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-2xl font-bold text-text1 mb-2">Something went wrong</div>
            <p className="text-text2 text-sm mb-1">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <p className="text-text2 text-xs mb-6">
              Try refreshing — if this keeps happening, contact your administrator.
            </p>
            <button
              className="btn-primary"
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/' }}
            >
              Return to dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
