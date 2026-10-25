import type { Transport, TransportHandlers } from '@/realtime/client'
import type { ServerEvent } from '@/realtime/events'
import { ulid } from './ids'

/**
 * Stand-in for a WebSocket server. Mock handlers call `emit`; the realtime client connects
 * through `connect` with the `mock://` URL from the ticket endpoint.
 */
class MockSocketServer {
  private connections = new Map<string, Set<TransportHandlers>>()

  connect(url: string, handlers: TransportHandlers): Transport {
    const userId = new URL(url).searchParams.get('ticket')?.split('.')[1] ?? ''
    const set = this.connections.get(userId) ?? new Set()
    set.add(handlers)
    this.connections.set(userId, set)
    queueMicrotask(() => handlers.onOpen())
    return {
      send: () => {},
      close: () => set.delete(handlers),
    }
  }

  emit(userId: string, event: ServerEvent) {
    const envelope = { ...event, id: ulid(), ts: new Date().toISOString() }
    this.connections.get(userId)?.forEach((h) => h.onEvent(envelope))
  }
}

export const mockSocket = new MockSocketServer()
