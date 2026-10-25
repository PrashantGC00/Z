import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ApiError, errorMessage } from '@/api/errors'
import { BACKENDS } from '@/config/backends'
import { cn } from '@/lib/cn'
import { useSession } from '@/stores/session'
import { Button } from './ui/Button'

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span
      role="status"
      className={cn('inline-block size-5 animate-spin rounded-full border-2 border-line border-t-ink', className)}
    >
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function PageSpinner() {
  return (
    <div className="grid place-items-center py-16">
      <Spinner />
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  )
}

function Notice({ tone, title, children }: { tone: 'offline' | 'down' | 'error'; title: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'm-4 rounded-2xl border p-5 text-sm',
        tone === 'offline' && 'border-(--backend)/40 bg-(--backend)/8',
        tone === 'down' && 'border-line bg-wash',
        tone === 'error' && 'border-danger/30 bg-danger/6',
      )}
    >
      <p className="mb-1 text-base font-semibold">{title}</p>
      <div className="space-y-3 text-muted [&_code]:font-mono [&_code]:text-fg">{children}</div>
    </div>
  )
}

const actionsClass = 'flex flex-wrap gap-4 font-medium text-ink [&_a]:underline-offset-4 [&_a:hover]:underline'

/**
 * Error view that tells apart "this backend has not built it yet", "this backend is not
 * running" and an ordinary failure, because each needs a different next step.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const backend = BACKENDS[useSession((s) => s.backendId)]
  if (error instanceof ApiError && error.isOffline) {
    return (
      <Notice tone="offline" title={`Not built on ${backend.name} yet`}>
        <p>{error.message} Mark it LIVE in the contract once the backend passes its tests, or switch to the mock.</p>
        <p className={actionsClass}>
          <Link to="/settings">Switch backend</Link>
        </p>
      </Notice>
    )
  }
  if (error instanceof ApiError && error.isUnreachable) {
    return (
      <Notice tone="down" title={`${backend.name} is not responding`}>
        <p>
          Nothing answered at <code>{backend.baseUrl}</code>. Start that backend, or switch to another one.
        </p>
        <p className={actionsClass}>
          {onRetry && (
            <Button variant="link" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Link to="/settings">Switch backend</Link>
        </p>
      </Notice>
    )
  }
  return (
    <Notice tone="error" title="That did not load">
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <p className={actionsClass}>
          <Button variant="link" onClick={onRetry}>
            Try again
          </Button>
        </p>
      )}
    </Notice>
  )
}

export function InlineError({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null
  const offline = error instanceof ApiError && error.isOffline
  return (
    <p role="alert" className={cn('text-sm text-danger', className)}>
      {offline ? 'This backend has not built that yet.' : errorMessage(error)}
    </p>
  )
}
