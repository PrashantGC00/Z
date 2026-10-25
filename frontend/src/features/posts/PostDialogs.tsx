import { type FormEvent, useState } from 'react'
import type { components } from '@/api/schema'
import { Dialog, DialogActions } from '@/components/Dialog'
import { InlineError } from '@/components/feedback'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { usePostETag, useReport, useSharePost, useUpdatePost } from './api'

type S = components['schemas']
type Reason = S['CreateReportRequest']['reason']

export function EditPostDialog({ post, onClose }: { post: S['Post']; onClose: () => void }) {
  const [text, setText] = useState(post.text)
  const etag = usePostETag(post.id)
  const update = useUpdatePost()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!etag.data) return
    update.mutate({ postId: post.id, etag: etag.data, body: { text } }, { onSuccess: onClose })
  }
  return (
    <Dialog open onClose={onClose} title="Edit post">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          aria-label="Post text"
        />
        <InlineError error={update.error ?? etag.error} />
        <DialogActions>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending || !etag.data || text === post.text}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export function SharePostDialog({ post, onClose }: { post: S['Post']; onClose: () => void }) {
  const [text, setText] = useState('')
  const share = useSharePost()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    share.mutate({ postId: post.id, text: text.trim() || undefined }, { onSuccess: onClose })
  }
  return (
    <Dialog open onClose={onClose} title="Share to your followers">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Textarea
          rows={3}
          placeholder="Add a thought (optional)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          aria-label="Your comment"
        />
        <blockquote className="rounded-xl border border-line p-3 text-sm">
          <strong>{post.author.displayName}</strong>
          <p className="mt-1 line-clamp-3 text-muted">{post.text}</p>
        </blockquote>
        <InlineError error={share.error} />
        <DialogActions>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={share.isPending}>
            {share.isPending ? 'Sharing…' : 'Share'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

const REASONS: Array<[Reason, string]> = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hate speech'],
  ['violence', 'Violence or threats'],
  ['nudity', 'Nudity or sexual content'],
  ['misinformation', 'False information'],
  ['other', 'Something else'],
]

export function ReportDialog({
  targetKind,
  targetId,
  onClose,
}: {
  targetKind: S['CreateReportRequest']['targetKind']
  targetId: string
  onClose: () => void
}) {
  const [reason, setReason] = useState<Reason>('spam')
  const [details, setDetails] = useState('')
  const report = useReport()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    report.mutate({ targetKind, targetId, reason, details: details.trim() || undefined })
  }
  return (
    <Dialog open onClose={onClose} title={`Report this ${targetKind}`}>
      {report.isSuccess ? (
        <div className="flex flex-col gap-3">
          <p>Thanks. A moderator will review it.</p>
          <DialogActions>
            <Button onClick={onClose}>Done</Button>
          </DialogActions>
        </div>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <fieldset className="flex flex-col">
            <legend className="sr-only">Reason</legend>
            {REASONS.map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-wash"
              >
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  className="accent-ink"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <Textarea
            rows={3}
            placeholder="Anything else we should know (optional)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={1000}
            aria-label="Details"
          />
          <InlineError error={report.error} />
          <DialogActions>
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={report.isPending}>
              {report.isPending ? 'Sending…' : 'Send report'}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  )
}
