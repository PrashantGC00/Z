import { Link } from 'react-router'
import { AtSign, Heart, MessageCircle, MessageSquare, Repeat2, UserPlus } from 'lucide-react'
import type { components } from '@/api/schema'
import { Avatar } from '@/components/Avatar'
import { EmptyState, ErrorState, PageSpinner } from '@/components/feedback'
import { LoadMore } from '@/components/LoadMore'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { PageHeader } from '@/features/shell/PageHeader'
import { useMarkAllRead, useMarkNotificationRead, useNotifications } from './api'

type Notification = components['schemas']['Notification']

const VERB: Record<Notification['type'], string> = {
  follow: 'followed you',
  post_like: 'liked your post',
  post_comment: 'commented on your post',
  comment_reply: 'replied to your comment',
  comment_like: 'liked your comment',
  post_share: 'shared your post',
  mention: 'mentioned you',
  message: 'sent you a message',
}

const ICON: Record<Notification['type'], typeof Heart> = {
  follow: UserPlus,
  post_like: Heart,
  post_comment: MessageCircle,
  comment_reply: MessageCircle,
  comment_like: Heart,
  post_share: Repeat2,
  mention: AtSign,
  message: MessageSquare,
}

function actorsText(n: Notification) {
  const [first, second] = n.actors
  if (!first) return 'Someone'
  if (n.actorCount === 1) return first.displayName
  if (n.actorCount === 2 && second) return `${first.displayName} and ${second.displayName}`
  return `${first.displayName} and ${n.actorCount - 1} others`
}

function hrefFor(n: Notification) {
  if (!n.target) return '/notifications'
  if (n.target.kind === 'user') return `/u/${n.actors[0]?.username ?? ''}`
  if (n.target.kind === 'conversation') return `/messages/${n.target.id}`
  if (n.target.kind === 'post') return `/p/${n.target.id}`
  return '/notifications'
}

function NotificationRow({ n }: { n: Notification }) {
  const { mutate: markRead } = useMarkNotificationRead()
  const Icon = ICON[n.type]
  return (
    <li>
      <Link
        to={hrefFor(n)}
        onClick={() => !n.read && markRead(n.id)}
        className={cn('flex gap-3 border-b border-line px-4 py-3 hover:bg-wash/60', !n.read && 'bg-ink/4')}
      >
        <Icon
          size={20}
          aria-hidden
          className={cn('mt-1 shrink-0', n.type.endsWith('like') ? 'text-danger' : 'text-ink')}
        />
        <div className="min-w-0 flex-1">
          <div className="flex -space-x-1.5">
            {n.actors.map((a) => (
              <Avatar key={a.id} user={a} size="sm" className="ring-2 ring-surface" />
            ))}
          </div>
          <p className="mt-1.5 text-[0.9375rem]">
            <strong>{actorsText(n)}</strong> {VERB[n.type]}
            <span className="text-muted"> · {timeAgo(n.createdAt)}</span>
          </p>
          {n.target?.preview && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{n.target.preview}</p>}
        </div>
        {!n.read && (
          <span className="mt-2 size-2.5 shrink-0 rounded-full bg-safelight">
            <span className="sr-only">Unread</span>
          </span>
        )}
      </Link>
    </li>
  )
}

export function NotificationsPage() {
  const query = useNotifications()
  const markAll = useMarkAllRead()
  const items = query.data?.pages.flatMap((p) => p.data) ?? []
  const hasUnread = items.some((n) => !n.read)

  return (
    <>
      <PageHeader title="Notifications">
        {hasUnread && (
          <Button variant="quiet" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            Mark all read
          </Button>
        )}
      </PageHeader>
      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length ? (
        <ul>
          {items.map((n) => (
            <NotificationRow key={n.id} n={n} />
          ))}
          <LoadMore
            hasMore={query.hasNextPage}
            loading={query.isFetchingNextPage}
            onLoad={() => void query.fetchNextPage()}
          />
        </ul>
      ) : (
        <EmptyState title="Nothing yet">Likes, comments and new followers show up here as they happen.</EmptyState>
      )}
    </>
  )
}
