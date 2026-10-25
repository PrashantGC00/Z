import { type FormEvent, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import type { components } from '@/api/schema'
import { Avatar } from '@/components/Avatar'
import { InlineError } from '@/components/feedback'
import { Button, IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { useMe } from '@/features/auth/api'
import { useOperationLive } from '@/features/backends/useOperationLive'
import { ACCEPTED_TYPES, useUploads } from '@/features/media/upload'
import { UploadTray } from '@/features/media/UploadTray'
import { cn } from '@/lib/cn'
import { useCreatePost } from './api'

type Visibility = components['schemas']['Visibility']

const MAX_LENGTH = 5000
const VISIBILITY_LABEL: Record<Visibility, string> = { public: 'Everyone', followers: 'Followers', private: 'Only me' }

export function Composer() {
  const { data: me } = useMe()
  const [text, setText] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const uploads = useUploads('post')
  const create = useCreatePost()
  const fileInput = useRef<HTMLInputElement>(null)
  const canUpload = useOperationLive('createMediaUpload')

  const empty = !text.trim() && !uploads.readyIds.length
  const remaining = MAX_LENGTH - text.length

  const submit = (e: Pick<FormEvent, 'preventDefault'>) => {
    e.preventDefault()
    if (empty || uploads.busy) return
    create.mutate(
      { text: text.trim() || undefined, mediaIds: uploads.readyIds, visibility },
      {
        onSuccess: () => {
          setText('')
          uploads.reset()
        },
      },
    )
  }

  if (!me) return null
  return (
    <form onSubmit={submit} className="flex gap-3 border-b border-line px-4 py-4">
      <Avatar user={me} />
      <div className="min-w-0 flex-1">
        <label htmlFor="composer-text" className="sr-only">
          New post
        </label>
        <textarea
          id="composer-text"
          placeholder="Share something with your followers"
          rows={text ? 3 : 2}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit(e)}
          className="w-full resize-none bg-transparent py-2 text-lg leading-snug placeholder:text-muted focus-visible:outline-none"
        />
        <UploadTray items={uploads.items} onRemove={uploads.remove} />
        <InlineError error={create.error} className="mt-2" />
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          {canUpload && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                multiple
                hidden
                onChange={(e) => {
                  uploads.add([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
              <IconButton label="Add photos or video" onClick={() => fileInput.current?.click()} className="text-ink">
                <ImagePlus size={20} />
              </IconButton>
            </>
          )}
          <label>
            <span className="sr-only">Who can see this</span>
            <Select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="rounded-full text-xs"
            >
              {Object.entries(VISIBILITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          {remaining < 200 && (
            <span className={cn('ml-auto text-xs text-muted tabular-nums', remaining < 20 && 'text-safelight')}>
              {remaining}
            </span>
          )}
          <Button
            type="submit"
            className={cn(remaining >= 200 && 'ml-auto')}
            disabled={empty || uploads.busy || create.isPending}
          >
            {create.isPending ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>
    </form>
  )
}
