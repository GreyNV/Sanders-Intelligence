import { cn } from '@/lib/utils'

const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }

export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div
      className={cn('animate-spin rounded-full border-2 border-border border-t-accent', sizes[size])}
      role="status"
      aria-label="Loading"
    />
  )
}

export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <LoadingSpinner size="lg" />
      <p className="text-text2 text-sm">Loading...</p>
    </div>
  )
}
