import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { UploadItem } from './upload'

const STAGE_LABEL: Record<UploadItem['stage'], string> = {
  uploading: 'Uploading',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}

export function UploadTray({ items, onRemove }: { items: UploadItem[]; onRemove: (key: string) => void }) {
  if (!items.length) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item.key}
          className={cn(
            'relative size-24 overflow-hidden rounded-xl border border-line bg-wash',
            item.stage === 'failed' && 'border-danger',
          )}
        >
          {item.file.type.startsWith('video/') ? (
            <video src={item.previewUrl} muted className="size-full object-cover" />
          ) : (
            <img src={item.previewUrl} alt="" className="size-full object-cover" />
          )}
          <div
            title={item.error}
            className={cn(
              'absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-2xs font-medium text-white',
              item.stage === 'ready' && 'bg-live/80',
              item.stage === 'failed' && 'bg-danger/90',
            )}
          >
            {item.stage === 'uploading' ? `${Math.round(item.progress * 100)}%` : STAGE_LABEL[item.stage]}
          </div>
          {item.stage === 'uploading' && (
            <progress
              max={1}
              value={item.progress}
              aria-label={`Uploading ${item.file.name}`}
              className="absolute inset-x-0 bottom-0 h-0.5 w-full appearance-none [&::-moz-progress-bar]:bg-ink [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-ink"
            />
          )}
          <button
            type="button"
            onClick={() => onRemove(item.key)}
            aria-label={`Remove ${item.file.name}`}
            className="absolute top-1 right-1 grid size-6 cursor-pointer place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <X size={14} />
          </button>
        </li>
      ))}
    </ul>
  )
}
