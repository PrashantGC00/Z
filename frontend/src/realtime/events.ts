import type { components } from '@/api/schema'

type S = components['schemas']

/** Server → client events. Mirrors the Realtime section of api/openapi.yaml. */
export type ServerEvent =
  | { type: 'message.created'; data: S['Message'] }
  | { type: 'conversation.read'; data: { conversationId: string; userId: string; lastReadMessageId: string } }
  | { type: 'typing'; data: { conversationId: string; userId: string } }
  | { type: 'presence.changed'; data: { userId: string; online: boolean; lastSeenAt?: string } }
  | { type: 'notification.created'; data: S['Notification'] }
  | { type: 'unread.changed'; data: S['UnreadCounts'] }
  | { type: 'post.stats'; data: { postId: string; likes: number; comments: number; shares: number } }

/** Client → server commands. */
export type ClientCommand =
  | { type: 'subscribe'; data: { postIds: string[] } }
  | { type: 'typing'; data: { conversationId: string } }
  | { type: 'resume'; data: { lastEventId: string } }
  | { type: 'pong' }

export type Envelope = ServerEvent & { id: string; ts: string }

export type EventType = ServerEvent['type']
export type EventOf<T extends EventType> = Extract<ServerEvent, { type: T }>
