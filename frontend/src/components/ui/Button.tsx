import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-on-ink hover:bg-ink-strong',
        secondary: 'border border-line bg-surface text-fg hover:bg-wash',
        quiet: 'text-ink hover:bg-wash',
        danger: 'bg-danger text-white hover:opacity-90',
        link: 'h-auto rounded-none px-0 font-medium text-ink underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3.5 text-sm',
        md: 'h-10 px-5 text-sm',
        lg: 'h-11 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

const iconButtonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-wash hover:text-fg disabled:pointer-events-none disabled:opacity-50',
  {
    variants: { size: { sm: 'size-7', md: 'size-9' } },
    defaultVariants: { size: 'md' },
  },
)

/** Icon-only button. `label` is required because there is no visible text. */
export function IconButton({
  className,
  size,
  label,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof iconButtonVariants> & { label: string }) {
  return <button type={type} aria-label={label} className={cn(iconButtonVariants({ size }), className)} {...props} />
}
