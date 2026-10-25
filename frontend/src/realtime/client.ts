import type { ClientCommand, Envelope, EventOf, EventType } from './events'

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

/** A transport moves envelopes; the client handles tickets, resume and backoff on top of it. */
export interface Transport {
  send(command: ClientCommand): void
  close(): void
}

export interface TransportHandlers {
  onOpen(): void
  onEvent(envelope: Envelope): void
  onClose(): void
}

export type TransportFactory = (url: string, handlers: TransportHandlers) => Transport

type Handler<T extends EventType> = (event: EventOf<T>['data']) => void

const MAX_BACKOFF_MS = 30_000

/**
 * One realtime connection per signed-in session. The URL comes from `POST /realtime/tickets`,
 * so the same client works against whichever backend is selected.
 */
export class RealtimeClient {
  private transport: Transport | null = null
  private handlers = new Map<EventType, Set<Handler<EventType>>>()
  private stateListeners = new Set<(state: ConnectionState) => void>()
  private lastEventId: string | null = null
  private attempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  state: ConnectionState = 'idle'

  private readonly getUrl: () => Promise<string>
  private readonly transports: (url: string) => TransportFactory

  constructor(getUrl: () => Promise<string>, transports: (url: string) => TransportFactory) {
    this.getUrl = getUrl
    this.transports = transports
  }

  start() {
    this.stopped = false
    void this.connect()
  }

  stop() {
    this.stopped = true
    clearTimeout(this.retryTimer)
    this.transport?.close()
    this.transport = null
    this.setState('closed')
  }

  send(command: ClientCommand) {
    if (this.state === 'open') this.transport?.send(command)
  }

  on<T extends EventType>(type: T, handler: Handler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set()
    set.add(handler as unknown as Handler<EventType>)
    this.handlers.set(type, set)
    return () => set.delete(handler as unknown as Handler<EventType>)
  }

  onState(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private setState(state: ConnectionState) {
    this.state = state
    this.stateListeners.forEach((l) => l(state))
  }

  private async connect() {
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting')
    let url: string
    try {
      url = await this.getUrl()
    } catch {
      this.scheduleRetry()
      return
    }
    if (this.stopped) return
    try {
      this.open(url)
    } catch {
      // e.g. a malformed URL from the ticket endpoint; treat it like a dropped connection.
      this.transport = null
      this.scheduleRetry()
    }
  }

  private open(url: string) {
    this.transport = this.transports(url)(url, {
      onOpen: () => {
        this.attempt = 0
        this.setState('open')
        if (this.lastEventId) this.transport?.send({ type: 'resume', data: { lastEventId: this.lastEventId } })
      },
      onEvent: (envelope) => {
        this.lastEventId = envelope.id
        this.handlers.get(envelope.type)?.forEach((h) => h(envelope.data))
      },
      onClose: () => {
        this.transport = null
        if (!this.stopped) this.scheduleRetry()
      },
    })
  }

  /** Exponential backoff with full jitter, so a backend restart is not met by a thundering herd. */
  private scheduleRetry() {
    if (this.stopped) return
    this.setState('reconnecting')
    const ceiling = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt++)
    this.retryTimer = setTimeout(() => void this.connect(), Math.random() * ceiling)
  }
}
