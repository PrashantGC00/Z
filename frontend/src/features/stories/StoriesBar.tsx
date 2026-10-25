import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import type { components } from '@/api/schema'
import { Avatar } from '@/components/Avatar'
import { Dialog } from '@/components/Dialog'
import { useMe } from '@/features/auth/api'
import { useOperationLive } from '@/features/backends/useOperationLive'
import { useUploads } from '@/features/media/upload'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/format'
import { useCreateStory, useMarkStorySeen, useStoryReel } from './api'

type StoryGroup = components['schemas']['StoryGroup']

const STORY_MS = 5000

function StoryViewer({ groups, startAt, onClose }: { groups: StoryGroup[]; startAt: number; onClose: () => void }) {
  const [groupIndex, setGroupIndex] = useState(startAt)
  const [storyIndex, setStoryIndex] = useState(() =>
    Math.max(
      0,
      groups[startAt].stories.findIndex((s) => !s.seen),
    ),
  )
  const { mutate: markSeen } = useMarkStorySeen()
  const group = groups[groupIndex]
  const story = group?.stories[storyIndex]

  const next = () => {
    if (storyIndex < group.stories.length - 1) setStoryIndex(storyIndex + 1)
    else if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1)
      setStoryIndex(0)
    } else onClose()
  }
  const prev = () => {
    if (storyIndex > 0) setStoryIndex(storyIndex - 1)
    else if (groupIndex > 0) {
      setGroupIndex(groupIndex - 1)
      setStoryIndex(0)
    }
  }

  // The auto-advance timer must always call the latest `next` without restarting.
  const nextRef = useRef(next)
  useEffect(() => {
    nextRef.current = next
  })

  const storyId = story?.id
  const unseen = story ? !story.seen : false
  useEffect(() => {
    if (!storyId) return
    if (unseen) markSeen(storyId)
    const timer = setTimeout(() => nextRef.current(), STORY_MS)
    return () => clearTimeout(timer)
    // Keyed on the story id: marking it seen must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId])

  if (!story) return null
  const src = story.media.variants.find((v) => v.name === 'original')?.url
  return (
    <Dialog open onClose={onClose} title={`Story from ${group.author.displayName}`} size="full">
      <div
        className="relative flex h-full flex-col bg-black text-white sm:aspect-[9/16]"
        onKeyDown={(e) => (e.key === 'ArrowRight' ? next() : e.key === 'ArrowLeft' ? prev() : null)}
      >
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
          {group.stories.map((s, i) => (
            <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                className={cn(
                  'block h-full origin-left bg-white',
                  i < storyIndex && 'scale-x-100',
                  i > storyIndex && 'scale-x-0',
                  i === storyIndex && 'animate-story',
                )}
                style={i === storyIndex ? { animationDuration: `${STORY_MS}ms` } : undefined}
              />
            </span>
          ))}
        </div>
        <div className="absolute inset-x-3 top-6 z-10 flex items-center gap-2 text-sm">
          <Avatar user={group.author} size="sm" />
          <strong>{group.author.displayName}</strong>
          <span className="text-white/70">{timeAgo(story.createdAt)}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stories"
            className="ml-auto grid size-8 cursor-pointer place-items-center rounded-full hover:bg-white/15"
          >
            <X size={20} />
          </button>
        </div>
        {src && (
          <img key={story.id} src={src} alt={story.caption ?? ''} className="m-auto max-h-full w-full object-contain" />
        )}
        {story.caption && (
          <p className="absolute inset-x-4 bottom-6 rounded-xl bg-black/50 px-3 py-2 text-center">{story.caption}</p>
        )}
        <button
          type="button"
          onClick={prev}
          aria-label="Previous story"
          className="absolute inset-y-0 left-0 grid w-1/3 cursor-pointer place-items-center opacity-0 hover:opacity-100 focus-visible:opacity-100"
        >
          <ChevronLeft size={32} />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next story"
          className="absolute inset-y-0 right-0 grid w-1/3 cursor-pointer place-items-center opacity-0 hover:opacity-100 focus-visible:opacity-100"
        >
          <ChevronRight size={32} />
        </button>
      </div>
    </Dialog>
  )
}

const chipClass = 'flex w-16 cursor-pointer flex-col items-center gap-1.5 text-xs disabled:cursor-wait'

function AddStory() {
  const uploads = useUploads('story')
  const { mutate: createStory, isPending } = useCreateStory()
  const input = useRef<HTMLInputElement>(null)
  const { data: me } = useMe()
  const item = uploads.items[0]
  const readyId = item?.stage === 'ready' ? item.media?.id : undefined
  const reset = uploads.reset

  useEffect(() => {
    if (readyId) createStory({ mediaId: readyId }, { onSettled: reset })
  }, [readyId, createStory, reset])

  if (!me) return null
  return (
    <li>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) uploads.add([e.target.files[0]])
          e.target.value = ''
        }}
      />
      <button
        type="button"
        className={chipClass}
        onClick={() => input.current?.click()}
        disabled={uploads.busy || isPending}
        title={item?.error}
      >
        <span className="relative">
          <Avatar user={me} size="lg" />
          <span
            aria-hidden
            className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full border-2 border-surface bg-ink text-on-ink"
          >
            <Plus size={12} strokeWidth={3} />
          </span>
        </span>
        <span className={cn('w-full truncate text-center', item?.error && 'text-danger')}>
          {uploads.busy || isPending ? 'Uploading…' : item?.error ? 'Failed' : 'Your story'}
        </span>
      </button>
    </li>
  )
}

export function StoriesBar() {
  const query = useStoryReel()
  const canPost = useOperationLive('createStory')
  const [viewing, setViewing] = useState<number | null>(null)
  if (query.isError) return null
  const groups = query.data ?? []

  return (
    <section aria-label="Stories" className="border-b border-line">
      <ul className="flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 py-4">
        {canPost && <AddStory />}
        {groups.map((g, i) => (
          <li key={g.author.id}>
            <button type="button" className={chipClass} onClick={() => setViewing(i)}>
              <Avatar user={g.author} size="lg" ring={g.hasUnseen ? 'unseen' : 'seen'} />
              <span className={cn('w-full truncate text-center', !g.hasUnseen && 'text-muted')}>
                {g.author.displayName.split(' ')[0]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {viewing !== null && <StoryViewer groups={groups} startAt={viewing} onClose={() => setViewing(null)} />}
    </section>
  )
}
