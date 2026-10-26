import { AsyncLocalStorage } from 'node:async_hooks'
import { trace } from '@opentelemetry/api'

export type RequestContext = {
  requestId: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId
}

export function getTraceId(): string | undefined {
  const ctx = trace.getActiveSpan()?.spanContext()
  return ctx && ctx.traceId !== '00000000000000000000000000000000' ? ctx.traceId : undefined
}
