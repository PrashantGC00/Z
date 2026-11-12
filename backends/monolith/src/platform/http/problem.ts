import type { ErrorRequestHandler, Response } from 'express'
import { STATUS_CODES } from 'node:http'
import { logger } from '../logger.js'
import { getTraceId } from '../request-context.js'
import { DrizzleQueryError } from 'drizzle-orm'

export type ProblemDetails = {
  type: string
  title: string
  status: number
  detail?: string | undefined
  instance?: string | undefined
  traceId?: string | undefined
  errors?: Array<{ field: string; message: string }> | undefined
}

export const UNAUTHORIZED_DETAIL = 'Missing or invalid access token'

export class ProblemError extends Error {
  readonly type = 'about:blank'

  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: ProblemDetails['errors'],
    readonly headers?: Record<string, string>,
  ) {
    super(detail ?? title)
    this.name = 'ProblemError'
  }
}

function send(res: Response, problem: ProblemDetails) {
  res.status(problem.status).type('application/problem+json').json(problem)
}

export const problemHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error)

  const base = { instance: req.originalUrl, traceId: getTraceId() }

  if (error?.headers && typeof error.headers === 'object') {
    res.set(error.headers)
  }

  const badJson = error?.type === 'entity.parse.failed'
  const notJson = error?.status === 415

  if (badJson || notJson) {
    return send(res, {
      type: 'about:blank',
      title: 'Validation failed',
      status: 422,
      errors: [{ field: 'body', message: badJson ? 'must be valid JSON' : 'must be application/json' }],
      ...base,
    })
  }

  if (error?.status === 400 && Array.isArray(error.errors)) {
    const onlyPathParams = error.errors.every((e: { path: string }) => e.path.startsWith('/params/'))
    if (onlyPathParams) {
      return send(res, { type: 'about:blank', title: 'Not Found', status: 404, ...base })
    }
    return send(res, {
      type: 'about:blank',
      title: 'Validation failed',
      status: 422,
      errors: error.errors.map((e: { path: string; message: string }) => ({
        field: e.path.replace(/^\/(body|query|params)\//, ''),
        message: e.message,
      })),
      ...base,
    })
  }

  if (error instanceof ProblemError) {
    return send(res, {
      type: error.type,
      title: error.title,
      status: error.status,
      ...(error.detail && { detail: error.detail }),
      ...(error.errors && { errors: error.errors }),
      ...base,
    })
  }

  const status = typeof error?.status === 'number' && error.status >= 400 && error.status < 600 ? error.status : 500

  if (status >= 500) {
    const logged = error instanceof DrizzleQueryError ? error.cause : error

    logger.error({ err: logged, ...base }, 'unhandled error')
    return send(res, { type: 'about:blank', title: 'Internal Server Error', status, ...base })
  }

  send(res, {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    ...(status === 401 && { detail: UNAUTHORIZED_DETAIL }),
    ...base,
  })
}
