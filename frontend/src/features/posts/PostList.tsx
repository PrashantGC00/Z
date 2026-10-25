import type { ReactNode } from 'react'
import { ErrorState, PageSpinner } from '@/components/feedback'
import { LoadMore } from '@/components/LoadMore'
import { type PostListSource, usePostList } from './api'
import { PostCard } from './PostCard'

export function PostList({ source, empty }: { source: PostListSource; empty: ReactNode }) {
  const query = usePostList(source)

  if (query.isPending) return <PageSpinner />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  const posts = query.data.pages.flatMap((p) => p.data)
  if (!posts.length) return <>{empty}</>

  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      <LoadMore
        hasMore={query.hasNextPage}
        loading={query.isFetchingNextPage}
        onLoad={() => void query.fetchNextPage()}
      />
      {!query.hasNextPage && posts.length > 5 && (
        <p className="py-10 text-center text-sm text-muted">You are all caught up.</p>
      )}
    </div>
  )
}
