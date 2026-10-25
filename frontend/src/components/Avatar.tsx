import { cva, type VariantProps } from 'class-variance-authority'
import type { components } from '@/api/schema'
import { cn } from '@/lib/cn'

type User = Pick<components['schemas']['UserSummary'], 'displayName' | 'avatarUrl'>

const avatarVariants = cva(
  'inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-wash font-semibold text-ink select-none',
  {
    variants: {
      size: {
        xs: 'size-5 text-[0.5rem]',
        sm: 'size-8 text-xs',
        md: 'size-11 text-sm',
        lg: 'size-14 text-base',
        xl: 'size-28 text-3xl',
      },
      // Story rings: a solid ink ring for unseen, a hairline for seen.
      ring: {
        none: '',
        unseen: 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
        seen: 'ring-1 ring-line ring-offset-2 ring-offset-surface',
      },
    },
    defaultVariants: { size: 'md', ring: 'none' },
  },
)

export function Avatar({
  user,
  size,
  ring,
  className,
}: { user: User; className?: string } & VariantProps<typeof avatarVariants>) {
  const initials = user.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className={cn(avatarVariants({ size, ring }), className)}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  )
}
