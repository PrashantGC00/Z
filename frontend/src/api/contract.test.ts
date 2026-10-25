import { describe, expect, it } from 'vitest'
import { coverage, isLive, operationById, operationForRoute, type OperationStatus, statusOf } from './contract'
import { OPERATIONS } from './contract.gen'

describe('contract helpers', () => {
  it('finds an operation by method and path template, in any method case', () => {
    expect(operationForRoute('get', '/users/me')?.operationId).toBe('getMe')
    expect(operationForRoute('GET', '/nope')).toBeUndefined()
  })

  it('treats every operation as LIVE on the mock', () => {
    expect(OPERATIONS.every((op) => statusOf(op, 'mock') === 'LIVE')).toBe(true)
    expect(coverage('mock')).toEqual({ live: OPERATIONS.length, total: OPERATIONS.length })
  })

  it("reads each architecture's status from x-status", () => {
    const health = operationById('getHealth')
    const status = statusOf(health, 'monolith')
    expect(status).toBe(health.status.monolith)
    expect(isLive('getHealth', 'monolith')).toBe(status === 'LIVE')
  })

  it('counts LIVE operations per backend', () => {
    const live = OPERATIONS.filter((op) => (op.status.microservices as OperationStatus) === 'LIVE').length
    expect(coverage('microservices')).toEqual({ live, total: OPERATIONS.length })
  })
})
