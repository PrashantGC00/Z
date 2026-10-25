import { type InfiniteData, QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'

type Post = components['schemas']['Post']
type PostPage = components['schemas']['PostPage']

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retrying an OFFLINE operation or a 4xx will never succeed.
      retry: (count, error) => !(error instanceof ApiError && (error.isOffline || error.status < 500)) && count < 2,
    },
  },
})

/**
 * Query keys. Every cached post list lives under `posts` so a like or edit can be patched
 * into every list at once. The cache is cleared on backend switch, so keys omit the backend.
 */
export const keys = {
  me: ['me'] as const,
  posts: ['posts'] as const,
  feed: ['posts', 'feed'] as const,
  userPosts: (username: string) => ['posts', 'user', username] as const,
  tagPosts: (tag: string) => ['posts', 'tag', tag] as const,
  bookmarks: ['posts', 'bookmarks'] as const,
  post: (id: string) => ['post', id] as const,
  comments: (postId: string, parentId?: string) => ['comments', postId, parentId ?? 'root'] as const,
  profile: (username: string) => ['profile', username] as const,
  followers: (username: string, kind: 'followers' | 'following') => ['graph', username, kind] as const,
  suggestions: ['suggestions'] as const,
  stories: ['stories'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (id: string) => ['messages', id] as const,
  notifications: ['notifications'] as const,
  unread: ['unread'] as const,
  preferences: ['preferences'] as const,
  search: (q: string) => ['search', q] as const,
  trending: ['trending'] as const,
}

function patchPost(post: Post, id: string, fn: (p: Post) => Post): Post {
  if (post.id === id) return fn(post)
  if (post.sharedPost?.id === id) return { ...post, sharedPost: fn(post.sharedPost) }
  return post
}

/** Apply `fn` to post `id` wherever it is cached: lists, detail views and shares of it. */
export function updatePostEverywhere(id: string, fn: (p: Post) => Post) {
  queryClient.setQueriesData<InfiniteData<PostPage>>(
    { queryKey: keys.posts },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({ ...page, data: page.data.map((p) => patchPost(p, id, fn)) })),
      },
  )
  queryClient.setQueryData<Post>(keys.post(id), (post) => post && fn(post))
}

export function removePostEverywhere(id: string) {
  queryClient.setQueriesData<InfiniteData<PostPage>>(
    { queryKey: keys.posts },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({ ...page, data: page.data.filter((p) => p.id !== id) })),
      },
  )
  queryClient.removeQueries({ queryKey: keys.post(id) })
}

/** Shared `getNextPageParam` for every cursor-paginated endpoint. */
export const nextCursor = (last: { page: { nextCursor?: string | null } }) => last.page.nextCursor ?? undefined
