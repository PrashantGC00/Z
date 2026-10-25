import type { ArchitectureId, BackendId } from '@/config/backends'
import { OPERATIONS } from './contract.gen'

export type Operation = (typeof OPERATIONS)[number]
export type OperationId = Operation['operationId']
export type OperationStatus = 'LIVE' | 'OFFLINE'

const byId = new Map<string, Operation>(OPERATIONS.map((op) => [op.operationId, op]))
const byRoute = new Map<string, Operation>(OPERATIONS.map((op) => [`${op.method} ${op.path}`, op]))

export function operationById(id: OperationId): Operation {
  return byId.get(id)!
}

/** `schemaPath` is the path template openapi-fetch hands to middleware, e.g. `/posts/{postId}`. */
export function operationForRoute(method: string, schemaPath: string): Operation | undefined {
  return byRoute.get(`${method.toUpperCase()} ${schemaPath}`)
}

export function statusOf(op: Operation, backend: BackendId): OperationStatus {
  // The mock implements the whole contract by definition.
  if (backend === 'mock') return 'LIVE'
  return op.status[backend as ArchitectureId]
}

export function isLive(id: OperationId, backend: BackendId): boolean {
  return statusOf(operationById(id), backend) === 'LIVE'
}

export interface Coverage {
  live: number
  total: number
}

export function coverage(backend: BackendId): Coverage {
  return {
    live: OPERATIONS.filter((op) => statusOf(op, backend) === 'LIVE').length,
    total: OPERATIONS.length,
  }
}
