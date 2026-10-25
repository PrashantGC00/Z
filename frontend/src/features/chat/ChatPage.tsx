import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'
import { ArrowLeft, PenSquare, Send } from 'lucide-react'
import type { components } from '@/api/schema'
import { Avatar } from '@/components/Avatar'
import { Dialog } from '@/components/Dialog'
import { EmptyState, ErrorState, InlineError, PageSpinner, Spinner } from '@/components/feedback'
import { LoadMore } from '@/components/LoadMore'
import { IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { useMe } from '@/features/auth/api'
import { useSearch } from '@/features/search/api'
import { cn } from '@/lib/cn'
import { formatClock, timeAgo } from '@/lib/format'
import { useRealtime } from '@/realtime/RealtimeProvider'
import { useTyping } from '@/stores/typing'
import {
  type ChatMessage,
  useConversation,
  useConversations,
  useMarkRead,
  useMessages,
  useSendMessage,
  useStartConversation,
} from './api'

type S = components['schemas']

const TYPING_THROTTLE_MS = 3000

function conversationTitle(c: S['Conversation'], meId: string | undefined) {
  if (c.title) return c.title
  const others = c.members.filter((m) => m.id !== meId)
  return others.map((m) => m.displayName).join(', ') || 'Just you'
}

function ConversationAvatar({ c, meId }: { c: S['Conversation']; meId?: string }) {
  const others = c.members.filter((m) => m.id !== meId)
  if (others.length <= 1) return <Avatar user={others[0] ?? c.members[0]} />
  return (
    <span className="relative size-11 shrink-0">
      <Avatar user={others[0]} size="sm" className="absolute top-0 left-0" />
      <Avatar user={others[1]} size="sm" className="absolute right-0 bottom-0 ring-2 ring-surface" />
    </span>
  )
}

function ConversationList() {
  const { data: me } = useMe()
  const query = useConversations()
  const [composing, setComposing] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <h1 className="text-xl font-bold">Messages</h1>
        <IconButton label="New message" onClick={() => setComposing(true)} className="text-ink">
          <PenSquare size={19} />
        </IconButton>
      </header>
      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {query.data.pages
            .flatMap((p) => p.data)
            .map((c) => (
              <li key={c.id}>
                <NavLink
                  to={`/messages/${c.id}`}
                  className={({ isActive }) =>
                    cn('flex items-center gap-3 px-4 py-3 hover:bg-wash', isActive && 'bg-wash')
                  }
                >
                  <ConversationAvatar c={c} meId={me?.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn('truncate', c.unreadCount ? 'font-bold' : 'font-medium')}>
                        {conversationTitle(c, me?.id)}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(c.updatedAt)}</span>
                    </span>
                    <span
                      className={cn('block truncate text-sm', c.unreadCount ? 'font-semibold text-fg' : 'text-muted')}
                    >
                      {c.lastMessage
                        ? `${c.lastMessage.sender.id === me?.id ? 'You: ' : ''}${c.lastMessage.text}`
                        : 'No messages yet'}
                    </span>
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="size-2.5 shrink-0 rounded-full bg-safelight">
                      <span className="sr-only">{c.unreadCount} unread</span>
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          <LoadMore
            hasMore={query.hasNextPage}
            loading={query.isFetchingNextPage}
            onLoad={() => void query.fetchNextPage()}
          />
        </ul>
      )}
      {composing && <NewConversationDialog onClose={() => setComposing(false)} />}
    </div>
  )
}

function NewConversationDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const search = useSearch(q)
  const start = useStartConversation()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const users = (search.data?.users ?? []).filter((u) => u.id !== me?.id)

  const open = (user: S['UserSummary']) =>
    start.mutate(
      { type: 'direct', memberIds: [user.id] },
      {
        onSuccess: (c) => {
          onClose()
          navigate(`/messages/${c.id}`)
        },
      },
    )

  return (
    <Dialog open onClose={onClose} title="New message">
      <Input
        autoFocus
        placeholder="Search people"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search people"
      />
      <ul className="mt-3 max-h-80 overflow-y-auto">
        {users.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => open(u)}
              disabled={start.isPending}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-wash"
            >
              <Avatar user={u} size="sm" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{u.displayName}</span>
                <span className="text-xs text-muted">@{u.username}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {q && search.isSuccess && !users.length && <p className="py-4 text-center text-sm text-muted">No one found.</p>}
      <InlineError error={search.error ?? start.error} />
    </Dialog>
  )
}

function Bubble({ message, mine, showMeta }: { message: ChatMessage; mine: boolean; showMeta: boolean }) {
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <p
        className={cn(
          'max-w-[75%] rounded-2xl px-3.5 py-2 text-[0.9375rem] break-words whitespace-pre-wrap',
          mine ? 'rounded-br-md bg-ink text-on-ink' : 'rounded-bl-md bg-wash',
          message.pending && 'opacity-60',
          message.failed && 'bg-danger/15 text-danger',
        )}
      >
        {message.text}
      </p>
      {(showMeta || message.failed) && (
        <span className="mt-1 px-1 text-2xs text-muted">
          {message.failed ? 'Not sent' : message.pending ? 'Sending…' : formatClock(message.createdAt)}
        </span>
      )}
    </div>
  )
}

function TypingIndicator({ conversation }: { conversation: S['Conversation'] }) {
  const typing = useTyping((s) => s.typing[conversation.id])
  const names = Object.keys(typing ?? {})
    .map((id) => conversation.members.find((m) => m.id === id)?.displayName.split(' ')[0])
    .filter(Boolean)
  if (!names.length) return null
  return (
    <p className="px-4 pb-1 text-xs text-muted" aria-live="polite">
      {names.join(', ')} {names.length === 1 ? 'is' : 'are'} typing…
    </p>
  )
}

function Thread({ conversationId }: { conversationId: string }) {
  const { data: me } = useMe()
  const conversation = useConversation(conversationId)
  const messages = useMessages(conversationId)
  const send = useSendMessage(conversationId, me)
  const { mutate: markRead } = useMarkRead(conversationId)
  const { client } = useRealtime()
  const [text, setText] = useState('')
  const lastTypingSent = useRef(0)

  const all: ChatMessage[] = messages.data?.pages.flatMap((p) => p.data) ?? []
  const newestFromOthers = all.find((m) => m.sender.id !== me?.id && !m.id.startsWith('pending-'))?.id

  useEffect(() => {
    if (newestFromOthers) markRead(newestFromOthers)
  }, [newestFromOthers, markRead])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    send.mutate({ clientMessageId: crypto.randomUUID(), text: body })
    setText('')
  }

  const onType = (value: string) => {
    setText(value)
    const now = Date.now()
    if (value && now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now
      client?.send({ type: 'typing', data: { conversationId } })
    }
  }

  if (conversation.isPending) return <PageSpinner />
  if (conversation.isError) return <ErrorState error={conversation.error} onRetry={() => void conversation.refetch()} />
  const c = conversation.data

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link to="/messages" className="md:hidden" aria-label="Back to conversations">
          <ArrowLeft size={20} />
        </Link>
        <ConversationAvatar c={c} meId={me?.id} />
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{conversationTitle(c, me?.id)}</h2>
          {c.type === 'group' && <p className="text-xs text-muted">{c.members.length} members</p>}
        </div>
      </header>

      {/* column-reverse keeps the view pinned to the newest message without scroll bookkeeping. */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-4 py-3">
        {messages.isPending ? (
          <Spinner className="m-auto" />
        ) : messages.isError ? (
          <ErrorState error={messages.error} />
        ) : (
          <>
            <ul className="flex flex-col-reverse gap-1">
              {all.map((m, i) => {
                const older = all[i + 1]
                const newer = all[i - 1]
                const mine = m.sender.id === me?.id
                const showMeta = !newer || newer.sender.id !== m.sender.id
                const startsRun = !older || older.sender.id !== m.sender.id
                return (
                  <li key={m.clientMessageId} className={cn(startsRun && 'mt-3')}>
                    {startsRun && !mine && c.type === 'group' && (
                      <p className="mb-0.5 px-1 text-xs text-muted">{m.sender.displayName}</p>
                    )}
                    <Bubble message={m} mine={mine} showMeta={showMeta} />
                  </li>
                )
              })}
            </ul>
            <LoadMore
              hasMore={messages.hasNextPage}
              loading={messages.isFetchingNextPage}
              onLoad={() => void messages.fetchNextPage()}
              label="Older messages"
            />
          </>
        )}
      </div>

      <TypingIndicator conversation={c} />
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line px-4 py-3">
        <input
          value={text}
          onChange={(e) => onType(e.target.value)}
          placeholder="Write a message"
          aria-label="Message"
          maxLength={4000}
          className="h-10 min-w-0 flex-1 rounded-full bg-wash px-4 text-sm placeholder:text-muted"
        />
        <IconButton
          type="submit"
          label="Send"
          disabled={!text.trim()}
          className="bg-ink text-on-ink hover:bg-ink-strong hover:text-on-ink"
        >
          <Send size={17} />
        </IconButton>
      </form>
    </div>
  )
}

export function ChatPage() {
  const { conversationId } = useParams()
  return (
    <div className="grid h-[calc(100dvh-4rem)] grid-cols-1 md:h-dvh md:grid-cols-[minmax(16rem,22rem)_1fr]">
      <aside className={cn('border-line md:border-r', conversationId && 'hidden md:block')}>
        <ConversationList />
      </aside>
      <section className={cn(!conversationId && 'hidden md:block')}>
        {conversationId ? (
          <Thread key={conversationId} conversationId={conversationId} />
        ) : (
          <div className="grid h-full place-items-center">
            <EmptyState title="Pick a conversation">Or start a new one with the pen button.</EmptyState>
          </div>
        )}
      </section>
    </div>
  )
}
