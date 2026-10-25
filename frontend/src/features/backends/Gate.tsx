import type { ReactNode } from 'react'
import type { OperationId } from '@/api/contract'
import { useOperationLive } from './useOperationLive'

/**
 * Renders children only when the operation is LIVE on the selected backend. Use for
 * optional affordances (a share button, a stories bar) so unfinished backends degrade quietly.
 */
export function WhenLive({
  op,
  children,
  fallback = null,
}: {
  op: OperationId
  children: ReactNode
  fallback?: ReactNode
}) {
  return useOperationLive(op) ? children : fallback
}
