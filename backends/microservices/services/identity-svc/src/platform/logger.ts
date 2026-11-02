import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Request } from 'express'
import pino from 'pino'
import { pinoHttp } from 'pino-http'
import { config } from '../config.ts'

const VALID_ID = /^[A-Za-z0-9._-]{1,128}$/

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ['request.headers.authorization', 'request.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
})

const pathOf = (req: IncomingMessage) => ((req as Request).originalUrl ?? req.url ?? '').split('?')[0]

const routeOf = (req: IncomingMessage) => {
  const r = req as Request
  return r.route ? `${r.baseUrl}${r.route.path}` : 'unmatched'
}

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/livez' || req.url === '/readyz',
  },
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const incoming = req.headers['x-request-id']
    const id = typeof incoming === 'string' && VALID_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader('X-Request-Id', id)
    return id
  },
  quietReqLogger: true,
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  customSuccessObject: (req, _res, val) => ({ ...val, route: routeOf(req) }),
  customErrorObject: (req, _res, _error, val) => ({ ...val, route: routeOf(req) }),
  customSuccessMessage: (req, res) => `${req.method} ${pathOf(req)} completed with ${res.statusCode}`,
  customErrorMessage: (req, res, error) =>
    `${req.method} ${pathOf(req)} failed with ${res.statusCode}: ${error.message}`,
  wrapSerializers: true,
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'durationMs',
    reqId: 'requestId',
  },
  serializers: {
    req: (req) => ({ method: req.method, path: pathOf(req.raw ?? req) }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
})
