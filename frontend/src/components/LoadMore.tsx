import { useEffect, useRef } from 'react'
import { Spinner } from './feedback'
import { Button } from './ui/Button'

interface LoadMoreProps {
  hasMore: boolean
  loading: boolean
  onLoad: () => void
  label?: string
}

/** Fetches the next page when it scrolls into view; the button covers keyboard users. */
export function LoadMore({ hasMore, loading, onLoad, label = 'Show more' }: LoadMoreProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && !loading && onLoad(), {
      rootMargin: '400px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, onLoad])

  if (!hasMore) return null
  return (
    <div ref={ref} className="flex justify-center py-4">
      {loading ? (
        <Spinner />
      ) : (
        <Button variant="quiet" size="sm" onClick={onLoad}>
          {label}
        </Button>
      )}
    </div>
  )
}
