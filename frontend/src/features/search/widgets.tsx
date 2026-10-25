import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { useSuggestions } from '@/features/social/api'
import { FollowButton } from '@/features/social/FollowButton'
import { plural } from '@/lib/format'
import { useTrending } from './api'

// Shared by the Explore page and the app shell's right column. Kept out of ExplorePage.tsx so
// the shell doesn't pull the lazily loaded page into the main bundle.

export function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  return (
    <label className="relative block">
      <span className="sr-only">Search Z</span>
      <Search
        size={17}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search people, posts and #tags"
        className="h-11 w-full rounded-full border border-transparent bg-wash pr-4 pl-11 text-sm placeholder:text-muted focus-visible:border-ink focus-visible:bg-surface focus-visible:outline-none"
      />
    </label>
  )
}

export function TrendingList({ limit }: { limit?: number }) {
  const query = useTrending()
  if (!query.data?.length) return null
  return (
    <ol>
      {query.data.slice(0, limit).map((h, i) => (
        <li key={h.tag}>
          <Link to={`/tag/${h.tag}`} className="flex flex-col px-4 py-2.5 hover:bg-wash/60">
            <span className="text-xs text-muted">{i + 1} · Trending</span>
            <span className="font-semibold">#{h.tag}</span>
            <span className="text-xs text-muted">{plural(h.postCount, 'post')}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

export function SuggestionList() {
  const query = useSuggestions()
  if (!query.data?.length) return null
  return (
    <ul>
      {query.data.map((u) => (
        <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
          <Link to={`/u/${u.username}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar user={u} size="sm" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{u.displayName}</span>
              <span className="truncate text-xs text-muted">
                {u.mutualCount ? `${plural(u.mutualCount, 'mutual')}` : `@${u.username}`}
              </span>
            </span>
          </Link>
          <FollowButton username={u.username} following={false} />
        </li>
      ))}
    </ul>
  )
}
