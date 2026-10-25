import { type ComponentProps, memo, type MouseEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BadgeCheck, Bookmark, Heart, Lock, MessageCircle, Repeat2, Users } from 'lucide-react'
import type { components } from '@/api/schema'
import { Avatar } from '@/components/Avatar'
import { Menu } from '@/components/Menu'
import { RichText } from '@/components/RichText'
import { useMe } from '@/features/auth/api'
import { WhenLive } from '@/features/backends/Gate'
import { CommentThread } from '@/features/comments/CommentThread'
import { cn } from '@/lib/cn'
import { formatCount, timeAgo } from '@/lib/format'
import { useDeletePost, useToggleBookmark, useToggleLike } from './api'
import { MediaGrid } from './MediaGrid'
import { EditPostDialog, ReportDialog, SharePostDialog } from './PostDialogs'

type Post = components['schemas']['Post']
type OpenDialog = 'edit' | 'share' | 'report' | null

/** Clicks on these keep their own behaviour instead of opening the post. */
const INTERACTIVE = 'a, button, input, textarea, select, label, video, dialog, [role="menu"], [data-no-open]'

export function AuthorLine({
  author,
  createdAt,
  href,
  editedAt,
}: {
  author: Post['author']
  createdAt: string
  href?: string
  editedAt?: string | null
}) {
  const time = <time dateTime={createdAt}>{timeAgo(createdAt)}</time>
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-sm">
      <Link to={`/u/${author.username}`} className="flex items-center gap-1 truncate font-semibold hover:underline">
        {author.displayName}
        {author.verified && <BadgeCheck size={15} className="shrink-0 self-center text-ink" aria-label="Verified" />}
      </Link>
      <span className="truncate text-muted">@{author.username}</span>
      <span aria-hidden className="text-muted">
        ·
      </span>
      {href ? (
        <Link to={href} className="shrink-0 text-muted hover:underline">
          {time}
        </Link>
      ) : (
        <span className="shrink-0 text-muted">{time}</span>
      )}
      {editedAt && <span className="shrink-0 text-xs text-muted">edited</span>}
    </div>
  )
}

function SharedPost({ post }: { post: Post }) {
  return (
    <Link
      to={`/p/${post.id}`}
      className="mt-3 block rounded-2xl border border-line p-3 transition-colors hover:bg-wash/50"
    >
      <div className="flex items-center gap-2 text-sm">
        <Avatar user={post.author} size="xs" />
        <strong>{post.author.displayName}</strong>
        <span className="text-muted">@{post.author.username}</span>
      </div>
      {post.text && (
        <p className="mt-1.5 line-clamp-4 text-[0.9375rem] whitespace-pre-wrap">
          <RichText text={post.text} />
        </p>
      )}
      <MediaGrid media={post.media} />
    </Link>
  )
}

/** Like / comment / share buttons. `active` paints the icon in the action's colour. */
function Action({
  active,
  activeClass,
  className,
  ...props
}: ComponentProps<'button'> & { active?: boolean; activeClass?: string }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-muted tabular-nums transition-colors hover:bg-wash hover:text-fg',
        active && activeClass,
        className,
      )}
      {...props}
    />
  )
}

interface PostCardProps {
  post: Post
  /** On the post page the thread is always open and the timestamp is not a link. */
  standalone?: boolean
}

export const PostCard = memo(function PostCard({ post, standalone = false }: PostCardProps) {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const like = useToggleLike()
  const bookmark = useToggleBookmark()
  const remove = useDeletePost()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [showComments, setShowComments] = useState(standalone)

  const mine = me?.id === post.author.id
  const isPureShare = Boolean(post.sharedPost && !post.text && !post.media.length)

  const menuItems = mine
    ? [
        { label: 'Edit post', onSelect: () => setDialog('edit') },
        {
          label: 'Delete post',
          tone: 'danger' as const,
          onSelect: () =>
            confirm('Delete this post? This cannot be undone.') &&
            remove.mutate(post.id, { onSuccess: () => standalone && navigate('/') }),
        },
      ]
    : [
        { label: 'Copy link', onSelect: () => void navigator.clipboard?.writeText(`${location.origin}/p/${post.id}`) },
        { label: 'Report post', tone: 'danger' as const, onSelect: () => setDialog('report') },
      ]

  // The whole card opens the post, like a link, without nesting the buttons inside one.
  // Keyboard users get the real link on the timestamp; text selection is left alone.
  const open = (e: MouseEvent<HTMLElement>) => {
    if (standalone || window.getSelection()?.toString()) return
    if ((e.target as Element).closest(INTERACTIVE)) return
    if (e.metaKey || e.ctrlKey) window.open(`/p/${post.id}`, '_blank', 'noopener')
    else navigate(`/p/${post.id}`)
  }

  return (
    <article
      className={cn(
        'border-b border-line px-4 pt-3 pb-1.5',
        !standalone && 'cursor-pointer transition-colors hover:bg-wash/40',
      )}
      aria-labelledby={`post-${post.id}-author`}
      onClick={open}
    >
      {isPureShare && (
        <p className="mb-1 ml-14 flex items-center gap-1.5 text-xs font-medium text-muted">
          <Repeat2 size={14} aria-hidden /> {mine ? 'You' : post.author.displayName} shared
        </p>
      )}
      <div className="flex gap-3">
        <Link to={`/u/${post.author.username}`} tabIndex={-1} aria-hidden className="shrink-0">
          <Avatar user={post.author} />
        </Link>
        <div className="min-w-0 flex-1">
          <header className="flex items-center gap-2" id={`post-${post.id}-author`}>
            <div className="min-w-0 flex-1">
              <AuthorLine
                author={post.author}
                createdAt={post.createdAt}
                editedAt={post.editedAt}
                href={standalone ? undefined : `/p/${post.id}`}
              />
            </div>
            {post.visibility === 'followers' && <Users size={14} className="text-muted" aria-label="Followers only" />}
            {post.visibility === 'private' && <Lock size={14} className="text-muted" aria-label="Only you" />}
            <Menu label="Post options" items={menuItems} />
          </header>

          {post.text && (
            <p
              className={cn(
                'mt-0.5 break-words whitespace-pre-wrap',
                standalone ? 'text-xl leading-snug' : 'text-[0.9375rem] leading-relaxed',
              )}
            >
              <RichText text={post.text} />
            </p>
          )}
          <MediaGrid media={post.media} />
          {post.sharedPost && <SharedPost post={post.sharedPost} />}

          <footer className="mt-1.5 -ml-2 flex items-center gap-4">
            <Action
              active={post.viewer.liked}
              activeClass="text-danger [&_svg]:fill-current"
              aria-pressed={post.viewer.liked}
              onClick={() => like.mutate({ post })}
            >
              <Heart size={18} aria-hidden />
              <span>{formatCount(post.stats.likes)}</span>
              <span className="sr-only">{post.viewer.liked ? 'Unlike' : 'Like'}</span>
            </Action>
            <Action aria-expanded={showComments} onClick={() => !standalone && setShowComments((v) => !v)}>
              <MessageCircle size={18} aria-hidden />
              <span>{formatCount(post.stats.comments)}</span>
              <span className="sr-only">Comments</span>
            </Action>
            <WhenLive op="sharePost">
              <Action onClick={() => setDialog('share')}>
                <Repeat2 size={18} aria-hidden />
                <span>{formatCount(post.stats.shares)}</span>
                <span className="sr-only">Share</span>
              </Action>
            </WhenLive>
            <WhenLive op="bookmarkPost">
              <Action
                className="ml-auto"
                active={post.viewer.bookmarked}
                activeClass="text-ink [&_svg]:fill-current"
                aria-pressed={post.viewer.bookmarked}
                onClick={() => bookmark.mutate({ post })}
              >
                <Bookmark size={18} aria-hidden />
                <span className="sr-only">{post.viewer.bookmarked ? 'Remove from saved' : 'Save'}</span>
              </Action>
            </WhenLive>
          </footer>

          {showComments && (
            <div data-no-open className="cursor-auto">
              <CommentThread postId={post.id} postAuthorId={post.author.id} />
            </div>
          )}
        </div>
      </div>

      {dialog === 'edit' && <EditPostDialog post={post} onClose={() => setDialog(null)} />}
      {dialog === 'share' && (
        <SharePostDialog
          post={isPureShare && post.sharedPost ? post.sharedPost : post}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'report' && <ReportDialog targetKind="post" targetId={post.id} onClose={() => setDialog(null)} />}
    </article>
  )
})
