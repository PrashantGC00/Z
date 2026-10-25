import type { InfiniteData } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import type { components } from '@/api/schema'
import { keys, queryClient, removePostEverywhere, updatePostEverywhere } from './query'

type Post = components['schemas']['Post']
type PostPage = components['schemas']['PostPage']

const post = (id: string, extra: Partial<Post> = {}): Post => ({
  id,
  author: { id: 'u1', username: 'test', displayName: 'Test' } as Post['author'],
  text: `post ${id}`,
  media: [],
  visibility: 'public',
  stats: { likes: 0, comments: 0, shares: 0 },
  viewer: { liked: false, bookmarked: false },
  createdAt: '2026-10-25T00:00:00Z',
  ...extra,
})

const pages = (...lists: Post[][]): InfiniteData<PostPage> => ({
  pages: lists.map((data) => ({ data, page: { nextCursor: null, hasMore: false } })),
  pageParams: lists.map(() => undefined),
})

const like = (p: Post): Post => ({ ...p, viewer: { ...p.viewer, liked: true } })
const feedIds = () => queryClient.getQueryData<InfiniteData<PostPage>>(keys.feed)!.pages.flatMap((p) => p.data)

beforeEach(() => {
  queryClient.clear()
  queryClient.setQueryData(keys.feed, pages([post('a'), post('b')], [post('s', { sharedPost: post('a') })]))
  queryClient.setQueryData(keys.userPosts('test'), pages([post('a')]))
  queryClient.setQueryData(keys.post('a'), post('a'))
})

describe('updatePostEverywhere', () => {
  it('patches the post in every list, inside shares, and in the detail cache', () => {
    updatePostEverywhere('a', like)

    const feed = feedIds()
    expect(feed.find((p) => p.id === 'a')?.viewer.liked).toBe(true)
    expect(feed.find((p) => p.id === 'b')?.viewer.liked).toBe(false)
    expect(feed.find((p) => p.id === 's')?.sharedPost?.viewer.liked).toBe(true)
    expect(feed.find((p) => p.id === 's')?.viewer.liked).toBe(false)
    expect(
      queryClient.getQueryData<InfiniteData<PostPage>>(keys.userPosts('test'))!.pages[0].data[0].viewer.liked,
    ).toBe(true)
    expect(queryClient.getQueryData<Post>(keys.post('a'))?.viewer.liked).toBe(true)
  })
})

describe('removePostEverywhere', () => {
  it('drops the post from lists and the detail cache', () => {
    removePostEverywhere('a')

    expect(feedIds().map((p) => p.id)).toEqual(['b', 's'])
    expect(queryClient.getQueryData<InfiniteData<PostPage>>(keys.userPosts('test'))!.pages[0].data).toEqual([])
    expect(queryClient.getQueryData(keys.post('a'))).toBeUndefined()
  })
})
