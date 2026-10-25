import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import type { components } from '@/api/schema'
import { keys, queryClient } from '@/lib/query'

type StoryGroup = components['schemas']['StoryGroup']

export function useStoryReel() {
  return useQuery({
    queryKey: keys.stories,
    queryFn: async () => unwrap(await api().GET('/stories')).data,
  })
}

export function useCreateStory() {
  return useMutation({
    mutationFn: async (body: { mediaId: string; caption?: string }) =>
      unwrap(await api().POST('/stories', { body, params: { header: { 'Idempotency-Key': crypto.randomUUID() } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.stories }),
  })
}

export function useMarkStorySeen() {
  return useMutation({
    mutationFn: async (storyId: string) => {
      unwrap(await api().POST('/stories/{storyId}/views', { params: { path: { storyId } } }))
      return storyId
    },
    onMutate: (storyId) =>
      queryClient.setQueryData<StoryGroup[]>(keys.stories, (groups) =>
        groups?.map((g) => {
          const stories = g.stories.map((s) => (s.id === storyId ? { ...s, seen: true } : s))
          return { ...g, stories, hasUnseen: stories.some((s) => !s.seen) }
        }),
      ),
  })
}
