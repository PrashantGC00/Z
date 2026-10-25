import type { components } from './schema'

export type Problem = components['schemas']['Problem']

export const OFFLINE_PROBLEM_TYPE = 'https://z.example/problems/operation-offline'
export const NETWORK_PROBLEM_TYPE = 'https://z.example/problems/unreachable'

export class ApiError extends Error {
  readonly problem: Problem

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.problem = problem
  }

  get status() {
    return this.problem.status
  }

  /** The selected backend has not built this operation yet (x-status: OFFLINE). */
  get isOffline() {
    return this.problem.type === OFFLINE_PROBLEM_TYPE
  }

  /** The backend could not be reached at all. */
  get isUnreachable() {
    return this.problem.type === NETWORK_PROBLEM_TYPE
  }

  fieldError(field: string) {
    return this.problem.errors?.find((e) => e.field === field)?.message
  }
}

export function problemResponse(problem: Problem): Response {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && 'title' in value && 'status' in value
}

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Turn an openapi-fetch result into data or a thrown ApiError, so React Query sees real errors. */
export function unwrap<T>(result: FetchResult<T>): T {
  if (result.error !== undefined || !result.response.ok) {
    const { error, response } = result
    throw new ApiError(
      isProblem(error)
        ? error
        : { type: 'about:blank', title: response.statusText || 'Request failed', status: response.status },
    )
  }
  return result.data as T
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
