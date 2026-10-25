import { type InfiniteData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'
import { keys, nextCursor, queryClient, removePostEverywhere, updatePostEverywhere } from '@/lib/query'

type S = components['schemas']
type PostPage = S['PostPage']

const LIMIT = 10

export type PostListSource =
  { kind: 'feed' } | { kind: 'user'; username: string } | { kind: 'tag'; tag: string } | { kind: 'bookmarks' }

function keyFor(source: PostListSource) {
  switch (source.kind) {
    case 'feed':
      return keys.feed
    case 'user':
      return keys.userPosts(source.username)
    case 'tag':
      return keys.tagPosts(source.tag)
    case 'bookmarks':
      return keys.bookmarks
  }
}

async function fetchPage(source: PostListSource, cursor?: string): Promise<PostPage> {
  const query = { cursor, limit: LIMIT }
  switch (source.kind) {
    case 'feed':
      return unwrap(await api().GET('/feed', { params: { query } }))
    case 'user':
      return unwrap(
        await api().GET('/users/{username}/posts', { params: { path: { username: source.username }, query } }),
      )
    case 'tag':
      return unwrap(await api().GET('/hashtags/{tag}/posts', { params: { path: { tag: source.tag }, query } }))
    case 'bookmarks':
      return unwrap(await api().GET('/bookmarks', { params: { query } }))
  }
}

export function usePostList(source: PostListSource) {
  return useInfiniteQuery({
    queryKey: keyFor(source),
    queryFn: ({ pageParam }) => fetchPage(source, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
  })
}

export function usePost(postId: string) {
  return useQuery({
    queryKey: keys.post(postId),
    queryFn: async () => unwrap(await api().GET('/posts/{postId}', { params: { path: { postId } } })),
  })
}

export function useCreatePost() {
  return useMutation({
    mutationFn: async (body: S['CreatePostRequest']) =>
      unwrap(await api().POST('/posts', { body, params: { header: { 'Idempotency-Key': crypto.randomUUID() } } })),
    onSuccess: (post) => {
      queryClient.setQueryData<InfiniteData<PostPage>>(
        keys.feed,
        (data) =>
          data && { ...data, pages: data.pages.map((p, i) => (i === 0 ? { ...p, data: [post, ...p.data] } : p)) },
      )
      void queryClient.invalidateQueries({ queryKey: keys.userPosts(post.author.username) })
    },
  })
}

/**
 * The post's ETag as of when editing began. Read once and never refetched, so an edit made
 * elsewhere in the meantime is rejected with 412 instead of silently overwritten.
 */
export function usePostETag(postId: string) {
  return useQuery({
    queryKey: ['etag', postId],
    queryFn: async () => {
      const result = await api().GET('/posts/{postId}', { params: { path: { postId } } })
      unwrap(result)
      const etag = result.response.headers.get('ETag')
      if (!etag) throw new Error('The backend did not send an ETag for this post.')
      return etag
    },
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function useUpdatePost() {
  return useMutation({
    mutationFn: async ({ postId, etag, body }: { postId: string; etag: string; body: S['UpdatePostRequest'] }) =>
      unwrap(
        await api().PATCH('/posts/{postId}', { params: { path: { postId }, header: { 'If-Match': etag } }, body }),
      ),
    onSuccess: (post) => updatePostEverywhere(post.id, () => post),
  })
}

export function useDeletePost() {
  return useMutation({
    mutationFn: async (postId: string) => {
      unwrap(await api().DELETE('/posts/{postId}', { params: { path: { postId } } }))
      return postId
    },
    onSuccess: removePostEverywhere,
  })
}

/** Optimistic: flip the heart immediately, reconcile with the server's count, roll back on failure. */
export function useToggleLike() {
  return useMutation({
    mutationFn: async ({ post }: { post: S['Post'] }) => {
      const params = { path: { postId: post.id } }
      return unwrap(
        post.viewer.liked
          ? await api().DELETE('/posts/{postId}/like', { params })
          : await api().PUT('/posts/{postId}/like', { params }),
      )
    },
    onMutate: ({ post }) => {
      const liked = !post.viewer.liked
      updatePostEverywhere(post.id, (p) => ({
        ...p,
        viewer: { ...p.viewer, liked },
        stats: { ...p.stats, likes: p.stats.likes + (liked ? 1 : -1) },
      }))
      return { previous: post }
    },
    onSuccess: (state, { post }) =>
      updatePostEverywhere(post.id, (p) => ({
        ...p,
        viewer: { ...p.viewer, liked: state.liked },
        stats: { ...p.stats, likes: state.likes },
      })),
    onError: (_e, _v, ctx) => ctx && updatePostEverywhere(ctx.previous.id, () => ctx.previous),
  })
}

export function useToggleBookmark() {
  return useMutation({
    mutationFn: async ({ post }: { post: S['Post'] }) => {
      const params = { path: { postId: post.id } }
      unwrap(
        post.viewer.bookmarked
          ? await api().DELETE('/posts/{postId}/bookmark', { params })
          : await api().PUT('/posts/{postId}/bookmark', { params }),
      )
    },
    onMutate: ({ post }) => {
      updatePostEverywhere(post.id, (p) => ({ ...p, viewer: { ...p.viewer, bookmarked: !post.viewer.bookmarked } }))
      return { previous: post }
    },
    onError: (_e, _v, ctx) => ctx && updatePostEverywhere(ctx.previous.id, () => ctx.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.bookmarks }),
  })
}

export function useSharePost() {
  return useMutation({
    mutationFn: async ({ postId, text }: { postId: string; text?: string }) =>
      unwrap(
        await api().POST('/posts/{postId}/shares', {
          params: { path: { postId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
          body: text ? { text } : {},
        }),
      ),
    onSuccess: (share) => {
      const original = share.sharedPost
      if (original)
        updatePostEverywhere(original.id, (p) => ({ ...p, stats: { ...p.stats, shares: p.stats.shares + 1 } }))
      void queryClient.invalidateQueries({ queryKey: keys.feed })
    },
  })
}

export function useReport() {
  return useMutation({
    mutationFn: async (body: S['CreateReportRequest']) => unwrap(await api().POST('/reports', { body })),
  })
}
