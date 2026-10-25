import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full font-semibold tabular-nums', {
  variants: {
    tone: {
      count: 'min-w-5 justify-center bg-safelight px-1.5 text-2xs text-white',
      live: 'bg-live/12 px-2 py-0.5 text-2xs text-live',
      offline: 'bg-offline/12 px-2 py-0.5 text-2xs text-offline',
      neutral: 'bg-wash px-2 py-0.5 text-xs text-muted',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
