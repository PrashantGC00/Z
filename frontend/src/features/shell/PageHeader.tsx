import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'

/** Sticky title bar at the top of the centre column. */
export function PageHeader({
  title,
  subtitle,
  back,
  children,
}: {
  title: string
  subtitle?: string
  back?: boolean
  children?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 py-2 backdrop-blur">
      {back && (
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}
