import type { components } from '@/api/schema'
import { cn } from '@/lib/cn'

type Media = components['schemas']['Media']

const pick = (m: Media, prefer: 'small' | 'original') =>
  m.variants.find((v) => v.name === prefer)?.url ??
  m.variants.find((v) => v.name === 'original')?.url ??
  m.variants[0]?.url

export function MediaGrid({ media }: { media: Media[] }) {
  if (!media.length) return null
  const shown = media.slice(0, 4)
  const count = shown.length
  return (
    <div
      className={cn(
        'mt-3 grid gap-0.5 overflow-hidden rounded-2xl border border-line',
        count === 1 ? 'grid-cols-1' : 'aspect-[16/10] grid-cols-2',
        count >= 3 && 'grid-rows-2',
      )}
    >
      {shown.map((m, i) => {
        const src = pick(m, count > 1 ? 'small' : 'original')
        return (
          <figure key={m.id} className={cn('relative min-h-0 bg-wash', count === 3 && i === 0 && 'row-span-2')}>
            {m.status !== 'ready' || !src ? (
              <div className="grid size-full min-h-40 place-items-center text-sm text-muted">Processing…</div>
            ) : m.kind === 'video' ? (
              <video
                src={src}
                controls
                preload="metadata"
                className="size-full max-h-[32rem] bg-black object-contain"
              />
            ) : (
              <img
                src={src}
                alt={m.altText ?? ''}
                loading="lazy"
                width={m.width}
                height={m.height}
                className={cn('size-full object-cover', count === 1 && 'max-h-[32rem]')}
              />
            )}
            {i === 3 && media.length > 4 && (
              <span className="absolute inset-0 grid place-items-center bg-black/50 text-2xl font-semibold text-white">
                +{media.length - 4}
              </span>
            )}
          </figure>
        )
      })}
    </div>
  )
}
