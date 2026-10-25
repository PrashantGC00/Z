import { useDeferredValue } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Avatar } from '@/components/Avatar'
import { EmptyState, ErrorState, PageSpinner } from '@/components/feedback'
import { PostCard } from '@/features/posts/PostCard'
import { useSearch } from './api'
import { SearchBox, SuggestionList, TrendingList } from './widgets'

const sectionTitle = 'px-4 pt-5 pb-2 text-lg font-bold'

function Results({ q }: { q: string }) {
  const query = useSearch(q)
  if (query.isPending) return <PageSpinner />
  if (query.isError) return <ErrorState error={query.error} />
  const { users, posts, hashtags } = query.data
  if (!users.length && !posts.length && !hashtags.length) {
    return <EmptyState title={`Nothing for “${q}”`}>Try a name, a username or a hashtag.</EmptyState>
  }
  return (
    <div className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
      {users.length > 0 && (
        <section>
          <h2 className={sectionTitle}>People</h2>
          <ul>
            {users.map((u) => (
              <li key={u.id}>
                <Link to={`/u/${u.username}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-wash/60">
                  <Avatar user={u} size="sm" />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{u.displayName}</span>
                    <span className="text-xs text-muted">@{u.username}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {hashtags.length > 0 && (
        <section>
          <h2 className={sectionTitle}>Hashtags</h2>
          <ul className="flex flex-wrap gap-2 px-4">
            {hashtags.map((h) => (
              <li key={h.tag}>
                <Link
                  to={`/tag/${h.tag}`}
                  className="block rounded-full bg-wash px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/10"
                >
                  #{h.tag} <span className="text-muted">{h.postCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {posts.length > 0 && (
        <section>
          <h2 className={sectionTitle}>Posts</h2>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </section>
      )}
    </div>
  )
}

export function ExplorePage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  // Typing stays responsive; the results list catches up when React has time.
  const deferred = useDeferredValue(q)

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur">
        <SearchBox value={q} onChange={(v) => setParams(v ? { q: v } : {}, { replace: true })} />
      </div>
      {deferred.trim() ? (
        <Results q={deferred} />
      ) : (
        <>
          <h2 className={sectionTitle}>Trending</h2>
          <TrendingList />
          <h2 className={sectionTitle}>People to follow</h2>
          <SuggestionList />
        </>
      )}
    </>
  )
}
