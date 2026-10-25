import { type CSSProperties, type ReactNode, useId, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'

interface MenuItem {
  label: string
  onSelect: () => void
  tone?: 'danger'
}

/** Overflow menu on the Popover API: light dismiss and top-layer stacking from the browser. */
export function Menu({ label, items, icon }: { label: string; items: MenuItem[]; icon?: ReactNode }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const anchor = `--menu-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
  if (!items.length) return null
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={label}
        style={{ anchorName: anchor } as CSSProperties}
        className="inline-grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-wash hover:text-fg"
      >
        {icon ?? <MoreHorizontal size={18} />}
      </button>
      <div
        ref={ref}
        id={id}
        popover="auto"
        role="menu"
        style={{ positionAnchor: anchor } as CSSProperties}
        className="menu-popover min-w-44 rounded-xl border border-line bg-surface p-1 text-fg shadow-lg"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={cn(
              'block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-wash',
              item.tone === 'danger' && 'text-danger',
            )}
            onClick={() => {
              ref.current?.hidePopover()
              item.onSelect()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
