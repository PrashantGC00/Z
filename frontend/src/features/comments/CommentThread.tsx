import { type FormEvent, useState } from 'react'
import { Heart } from 'lucide-react'
import type { components } from '@/api/schema'
import { Avatar } from '@/components/Avatar'
import { ErrorState, InlineError, Spinner } from '@/components/feedback'
import { LoadMore } from '@/components/LoadMore'
import { Menu } from '@/components/Menu'
import { RichText } from '@/components/RichText'
import { Button } from '@/components/ui/Button'
import { useMe } from '@/features/auth/api'
import { AuthorLine } from '@/features/posts/PostCard'
import { cn } from '@/lib/cn'
import { formatCount, plural } from '@/lib/format'
import { useComments, useCreateComment, useDeleteComment, useToggleCommentLike } from './api'

type Comment = components['schemas']['Comment']

const textAction = 'inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-muted hover:text-fg'

function CommentForm({
  postId,
  parentId,
  placeholder,
  onDone,
  autoFocus,
}: {
  postId: string
  parentId?: string
  placeholder: string
  onDone?: () => void
  autoFocus?: boolean
}) {
  const { data: me } = useMe()
  const [text, setText] = useState('')
  const create = useCreateComment(postId)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    create.mutate(
      { text: text.trim(), parentId },
      {
        onSuccess: () => {
          setText('')
          onDone?.()
        },
      },
    )
  }
  if (!me) return null
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 py-2">
      <Avatar user={me} size="sm" />
      <input
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        aria-label={placeholder}
        autoFocus={autoFocus}
        className="h-9 min-w-0 flex-1 rounded-full bg-wash px-4 text-sm placeholder:text-muted focus-visible:outline-ink"
      />
      <Button type="submit" size="sm" disabled={!text.trim() || create.isPending}>
        Reply
      </Button>
      <InlineError error={create.error} className="w-full pl-10" />
    </form>
  )
}

function CommentItem({ comment, postAuthorId }: { comment: Comment; postAuthorId: string }) {
  const { data: me } = useMe()
  const like = useToggleCommentLike()
  const remove = useDeleteComment()
  const [replying, setReplying] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const isRoot = !comment.parentId
  const canDelete = me && (me.id === comment.author.id || me.id === postAuthorId)

  return (
    <li className="flex gap-2 py-1.5">
      <Avatar user={comment.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-wash px-3.5 py-2">
          <AuthorLine author={comment.author} createdAt={comment.createdAt} editedAt={comment.editedAt} />
          <p className="text-sm break-words whitespace-pre-wrap">
            <RichText text={comment.text} />
          </p>
        </div>
        <div className="flex items-center gap-4 px-3 pt-1">
          <button
            type="button"
            aria-pressed={comment.viewer.liked}
            onClick={() => like.mutate(comment)}
            className={cn(textAction, comment.viewer.liked && 'text-danger [&_svg]:fill-current')}
          >
            <Heart size={13} aria-hidden /> {comment.likes ? formatCount(comment.likes) : 'Like'}
          </button>
          {isRoot && (
            <button type="button" className={textAction} onClick={() => setReplying((v) => !v)}>
              Reply
            </button>
          )}
          {canDelete && (
            <Menu
              label="Comment options"
              items={[{ label: 'Delete comment', tone: 'danger', onSelect: () => remove.mutate(comment) }]}
            />
          )}
        </div>
        {isRoot && comment.replyCount > 0 && !showReplies && (
          <button type="button" className={cn(textAction, 'px-3 pt-1 text-ink')} onClick={() => setShowReplies(true)}>
            View {plural(comment.replyCount, 'reply', 'replies')}
          </button>
        )}
        {isRoot && (showReplies || replying) && (
          <Replies postId={comment.postId} parentId={comment.id} postAuthorId={postAuthorId} />
        )}
        {replying && (
          <CommentForm
            postId={comment.postId}
            parentId={comment.id}
            placeholder={`Reply to ${comment.author.displayName}`}
            onDone={() => {
              setReplying(false)
              setShowReplies(true)
            }}
            autoFocus
          />
        )}
      </div>
    </li>
  )
}

function Replies({ postId, parentId, postAuthorId }: { postId: string; parentId: string; postAuthorId: string }) {
  const query = useComments(postId, parentId)
  if (query.isPending) return <Spinner className="m-2" />
  if (query.isError) return <InlineError error={query.error} />
  return (
    <ul className="pt-1">
      {query.data.pages
        .flatMap((p) => p.data)
        .map((c) => (
          <CommentItem key={c.id} comment={c} postAuthorId={postAuthorId} />
        ))}
      <LoadMore
        hasMore={query.hasNextPage}
        loading={query.isFetchingNextPage}
        onLoad={() => void query.fetchNextPage()}
        label="More replies"
      />
    </ul>
  )
}

export function CommentThread({ postId, postAuthorId }: { postId: string; postAuthorId: string }) {
  const query = useComments(postId)
  return (
    <section aria-label="Comments" className="mt-1 border-t border-line pb-2">
      <CommentForm postId={postId} placeholder="Write a comment" />
      {query.isPending ? (
        <Spinner className="m-2" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ul>
          {query.data.pages
            .flatMap((p) => p.data)
            .map((c) => (
              <CommentItem key={c.id} comment={c} postAuthorId={postAuthorId} />
            ))}
          <LoadMore
            hasMore={query.hasNextPage}
            loading={query.isFetchingNextPage}
            onLoad={() => void query.fetchNextPage()}
            label="More comments"
          />
        </ul>
      )}
    </section>
  )
}
