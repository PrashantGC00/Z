import { type ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from './ui/Button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'md' | 'full'
}

/** Native <dialog>: focus trapping, Escape and the top layer come from the browser. */
export function Dialog({ open, onClose, title, children, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
      className={cn(
        'm-auto bg-surface text-fg shadow-2xl',
        size === 'md' && 'w-[min(32rem,calc(100vw-2rem))] rounded-2xl',
        size === 'full' &&
          // A <dialog> stretches to the viewport when its width is auto, so size it to 9:16 explicitly.
          'h-dvh max-h-none w-full max-w-none bg-black sm:h-[min(90dvh,52rem)] sm:w-[calc(min(90dvh,52rem)*9/16)] sm:rounded-2xl',
      )}
    >
      {open &&
        (size === 'full' ? (
          children
        ) : (
          <div className="p-5">
            <header className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </header>
            {children}
          </div>
        ))}
    </dialog>
  )
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex justify-end gap-2">{children}</div>
}
