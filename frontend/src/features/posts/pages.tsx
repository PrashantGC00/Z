import { Link, useParams } from 'react-router'
import { EmptyState, ErrorState, PageSpinner } from '@/components/feedback'
import { WhenLive } from '@/features/backends/Gate'
import { PageHeader } from '@/features/shell/PageHeader'
import { StoriesBar } from '@/features/stories/StoriesBar'
import { usePost } from './api'
import { Composer } from './Composer'
import { PostCard } from './PostCard'
import { PostList } from './PostList'

export function FeedPage() {
  return (
    <>
      <PageHeader title="Home" />
      <WhenLive op="listStoryReel">
        <StoriesBar />
      </WhenLive>
      <WhenLive op="createPost">
        <Composer />
      </WhenLive>
      <PostList
        source={{ kind: 'feed' }}
        empty={
          <EmptyState title="Your feed is quiet">
            Follow a few people from{' '}
            <Link to="/explore" className="text-ink underline">
              Explore
            </Link>{' '}
            and their posts will land here.
          </EmptyState>
        }
      />
    </>
  )
}

export function PostPage() {
  const { postId = '' } = useParams()
  const query = usePost(postId)
  return (
    <>
      <PageHeader back title="Post" />
      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <PostCard post={query.data} standalone />
      )}
    </>
  )
}

export function HashtagPage() {
  const { tag = '' } = useParams()
  return (
    <>
      <PageHeader back title={`#${tag}`} />
      <PostList source={{ kind: 'tag', tag }} empty={<EmptyState title={`No posts with #${tag} yet`} />} />
    </>
  )
}

export function BookmarksPage() {
  return (
    <>
      <PageHeader title="Saved" />
      <PostList
        source={{ kind: 'bookmarks' }}
        empty={<EmptyState title="Nothing saved yet">Tap the bookmark on any post to keep it here.</EmptyState>}
      />
    </>
  )
}
