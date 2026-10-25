import { type InfiniteData, useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'
import { keys, nextCursor, queryClient, updatePostEverywhere } from '@/lib/query'

type S = components['schemas']
type CommentPage = S['CommentPage']

export function useComments(postId: string, parentId?: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.comments(postId, parentId),
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api().GET('/posts/{postId}/comments', {
          params: { path: { postId }, query: { cursor: pageParam, limit: 20, parentId } },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    enabled,
  })
}

function patchComment(comment: S['Comment'], fn: (c: S['Comment']) => S['Comment']) {
  queryClient.setQueriesData<InfiniteData<CommentPage>>(
    { queryKey: ['comments', comment.postId] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((p) => ({ ...p, data: p.data.map((c) => (c.id === comment.id ? fn(c) : c)) })),
      },
  )
}

export function useCreateComment(postId: string) {
  return useMutation({
    mutationFn: async (body: S['CreateCommentRequest']) =>
      unwrap(
        await api().POST('/posts/{postId}/comments', {
          params: { path: { postId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
          body,
        }),
      ),
    onSuccess: (comment) => {
      // Comments are oldest-first, so a new one goes at the end of the last loaded page.
      queryClient.setQueryData<InfiniteData<CommentPage>>(
        keys.comments(postId, comment.parentId ?? undefined),
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((p, i, all) => (i === all.length - 1 ? { ...p, data: [...p.data, comment] } : p)),
          },
      )
      if (comment.parentId) {
        queryClient.setQueriesData<InfiniteData<CommentPage>>(
          { queryKey: keys.comments(postId) },
          (data) =>
            data && {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                data: p.data.map((c) => (c.id === comment.parentId ? { ...c, replyCount: c.replyCount + 1 } : c)),
              })),
            },
        )
      }
      updatePostEverywhere(postId, (p) => ({ ...p, stats: { ...p.stats, comments: p.stats.comments + 1 } }))
    },
  })
}

export function useToggleCommentLike() {
  return useMutation({
    mutationFn: async (comment: S['Comment']) => {
      const params = { path: { commentId: comment.id } }
      return unwrap(
        comment.viewer.liked
          ? await api().DELETE('/comments/{commentId}/like', { params })
          : await api().PUT('/comments/{commentId}/like', { params }),
      )
    },
    onMutate: (comment) => {
      const liked = !comment.viewer.liked
      patchComment(comment, (c) => ({ ...c, viewer: { liked }, likes: c.likes + (liked ? 1 : -1) }))
      return { previous: comment }
    },
    onSuccess: (state, comment) =>
      patchComment(comment, (c) => ({ ...c, viewer: { liked: state.liked }, likes: state.likes })),
    onError: (_e, _v, ctx) => ctx && patchComment(ctx.previous, () => ctx.previous),
  })
}

export function useDeleteComment() {
  return useMutation({
    mutationFn: async (comment: S['Comment']) => {
      unwrap(await api().DELETE('/comments/{commentId}', { params: { path: { commentId: comment.id } } }))
      return comment
    },
    onSuccess: (comment) => {
      queryClient.setQueriesData<InfiniteData<CommentPage>>(
        { queryKey: ['comments', comment.postId] },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((p) => ({ ...p, data: p.data.filter((c) => c.id !== comment.id) })),
          },
      )
      updatePostEverywhere(comment.postId, (p) => ({
        ...p,
        stats: { ...p.stats, comments: Math.max(0, p.stats.comments - 1) },
      }))
    },
  })
}
