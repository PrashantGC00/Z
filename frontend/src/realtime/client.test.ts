import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeClient, type TransportFactory, type TransportHandlers } from './client'
import type { ClientCommand, Envelope } from './events'

/** A transport the test drives by hand: open it, push events, drop it. */
function fakeTransports() {
  const connections: { url: string; handlers: TransportHandlers; sent: ClientCommand[]; closed: boolean }[] = []
  const factory: TransportFactory = (url, handlers) => {
    const conn = { url, handlers, sent: [] as ClientCommand[], closed: false }
    connections.push(conn)
    return {
      send: (command) => conn.sent.push(command),
      close: () => {
        conn.closed = true
      },
    }
  }
  return { connections, transports: () => factory }
}

const event = (id: string): Envelope => ({
  id,
  ts: '2026-10-25T00:00:00Z',
  type: 'typing',
  data: { conversationId: 'c1', userId: 'u1' },
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('RealtimeClient', () => {
  it('delivers events and reconnects with a resume after a drop', async () => {
    const { connections, transports } = fakeTransports()
    const client = new RealtimeClient(async () => 'ws://test', transports)
    const onTyping = vi.fn()
    client.on('typing', onTyping)

    client.start()
    await vi.advanceTimersByTimeAsync(0)
    connections[0].handlers.onOpen()
    expect(client.state).toBe('open')
    connections[0].handlers.onEvent(event('e1'))
    expect(onTyping).toHaveBeenCalledWith({ conversationId: 'c1', userId: 'u1' })

    connections[0].handlers.onClose()
    expect(client.state).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(500)
    expect(connections).toHaveLength(2)
    connections[1].handlers.onOpen()
    expect(connections[1].sent).toEqual([{ type: 'resume', data: { lastEventId: 'e1' } }])
  })

  it('backs off with a growing ceiling and resets it after a successful open', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const getUrl = vi.fn().mockRejectedValue(new Error('down'))
    const { connections, transports } = fakeTransports()
    const client = new RealtimeClient(getUrl, transports)

    client.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(getUrl).toHaveBeenCalledTimes(1)
    // Retry ceilings: 500 ms, then 1000 ms, then 2000 ms.
    await vi.advanceTimersByTimeAsync(499)
    expect(getUrl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(998)
    expect(getUrl).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2)
    expect(getUrl).toHaveBeenCalledTimes(3)

    getUrl.mockResolvedValue('ws://test')
    await vi.advanceTimersByTimeAsync(2000)
    connections[0].handlers.onOpen()
    connections[0].handlers.onClose()
    // Back to the first ceiling.
    await vi.advanceTimersByTimeAsync(500)
    expect(connections).toHaveLength(2)
    client.stop()
  })

  it('cancels a pending retry on stop', async () => {
    const { connections, transports } = fakeTransports()
    const client = new RealtimeClient(async () => 'ws://test', transports)

    client.start()
    await vi.advanceTimersByTimeAsync(0)
    connections[0].handlers.onOpen()
    connections[0].handlers.onClose()
    client.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(connections).toHaveLength(1)
    expect(client.state).toBe('closed')
  })

  it('closes the open transport on stop', async () => {
    const { connections, transports } = fakeTransports()
    const client = new RealtimeClient(async () => 'ws://test', transports)

    client.start()
    await vi.advanceTimersByTimeAsync(0)
    connections[0].handlers.onOpen()
    client.stop()
    expect(connections[0].closed).toBe(true)
  })
})
