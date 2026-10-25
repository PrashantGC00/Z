import { mockSocket } from '@/mocks/realtime'
import type { Envelope } from './events'
import type { TransportFactory } from './client'

const HEARTBEAT_TIMEOUT_MS = 60_000

/** Native WebSocket. The server pings every 25 s; silence for 60 s means the link is dead. */
export const webSocketTransport: TransportFactory = (url, handlers) => {
  const ws = new WebSocket(url)
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const armWatchdog = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => ws.close(), HEARTBEAT_TIMEOUT_MS)
  }

  ws.onopen = () => {
    armWatchdog()
    handlers.onOpen()
  }
  ws.onmessage = (msg) => {
    armWatchdog()
    let frame: Envelope | { type: 'ping' }
    try {
      frame = JSON.parse(String(msg.data)) as Envelope | { type: 'ping' }
    } catch {
      return // One bad frame should not take the connection down.
    }
    if (frame.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }))
      return
    }
    handlers.onEvent(frame as Envelope)
  }
  ws.onclose = () => {
    clearTimeout(watchdog)
    handlers.onClose()
  }

  return {
    send: (command) => ws.send(JSON.stringify(command)),
    close: () => {
      ws.onclose = null
      clearTimeout(watchdog)
      ws.close()
    },
  }
}

/** The mock backend hands out `mock://` URLs; events come from the in-browser mock instead of a socket. */
export const mockTransport: TransportFactory = (url, handlers) => mockSocket.connect(url, handlers)

export const transportFor = (url: string): TransportFactory =>
  url.startsWith('mock://') ? mockTransport : webSocketTransport
