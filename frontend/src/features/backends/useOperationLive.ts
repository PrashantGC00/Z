import { isLive, type OperationId } from '@/api/contract'
import { useSession } from '@/stores/session'

/** True when the selected backend serves this operation (or x-status gating is turned off). */
export function useOperationLive(id: OperationId): boolean {
  const backendId = useSession((s) => s.backendId)
  const respect = useSession((s) => s.respectStatus)
  return !respect || isLive(id, backendId)
}
