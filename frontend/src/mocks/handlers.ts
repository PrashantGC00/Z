import { delay, http, HttpResponse, type DefaultBodyType, type HttpResponseResolver, type PathParams } from 'msw'
import type { components } from '@/api/schema'
import {
  canSee,
  db,
  follows,
  relationship,
  toComment,
  toConversation,
  toMe,
  toMedia,
  toMessage,
  toNotification,
  toPost,
  toProfile,
  toSummary,
  unreadCounts,
  userById,
  userByUsername,
  type MessageRow,
  type NotificationRow,
  type PostRow,
} from './db'
import { ulid } from './ids'
import { mockSocket } from './realtime'

type S = components['schemas']

const BASE = '/mock/v1'
const ACCESS_TTL_S = 900

// ─────────────────────────── helpers ───────────────────────────

const problem = (status: number, title: string, detail?: string, errors?: S['Problem']['errors']): Response =>
  HttpResponse.json<S['Problem']>(
    {
      type: `https://z.example/problems/${title.toLowerCase().replaceAll(' ', '-')}`,
      title,
      status,
      detail,
      errors,
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )

const notFound = (what: string) => problem(404, 'Not found', `${what} does not exist.`)

function issueTokens(userId: string): S['AuthTokens'] {
  const refreshToken = `mock-refresh.${userId}.${ulid()}`
  db.refreshTokens.set(refreshToken, { userId, used: false })
  return {
    accessToken: `mock-access.${userId}.${Date.now() + ACCESS_TTL_S * 1000}`,
    refreshToken,
    expiresIn: ACCESS_TTL_S,
  }
}

function viewerOf(request: Request): string | null {
  const [, userId, exp] = request.headers.get('Authorization')?.replace('Bearer ', '').split('.') ?? []
  if (!userId || !db.users.has(userId) || Number(exp) < Date.now()) return null
  return userId
}

type Resolver<P extends PathParams> = (
  args: Parameters<HttpResponseResolver<P, DefaultBodyType>>[0] & { me: string },
) => ReturnType<HttpResponseResolver<P, DefaultBodyType>>

/** Adds latency that looks like a real network and rejects unauthenticated calls. */
function authed<P extends PathParams>(resolver: Resolver<P>): HttpResponseResolver<P, DefaultBodyType> {
  return async (args) => {
    await delay(80 + Math.random() * 220)
    const me = viewerOf(args.request)
    if (!me) return problem(401, 'Unauthorized', 'Sign in again.')
    return resolver({ ...args, me })
  }
}

function page<T>(items: T[], request: Request) {
  const url = new URL(request.url)
  const offset = Number(url.searchParams.get('cursor') ?? 0) || 0
  const limit = Math.min(50, Number(url.searchParams.get('limit') ?? 20) || 20)
  const data = items.slice(offset, offset + limit)
  const hasMore = offset + limit < items.length
  return { data, page: { nextCursor: hasMore ? String(offset + limit) : null, hasMore } }
}

const newestFirst = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt)
const later = (ms: number, fn: () => void) => setTimeout(fn, ms)

function notify(userId: string, type: S['NotificationType'], actorId: string, target?: S['Notification']['target']) {
  if (userId === actorId) return
  const inbox = db.notifications.get(userId) ?? []
  // Aggregate unread notifications of the same type on the same target: "A and 3 others liked…"
  const existing = target && inbox.find((n) => !n.read && n.type === type && n.target?.id === target.id)
  let row: NotificationRow
  if (existing) {
    existing.actorIds = [actorId, ...existing.actorIds.filter((a) => a !== actorId)]
    existing.createdAt = new Date().toISOString()
    inbox.splice(inbox.indexOf(existing), 1)
    row = existing
  } else {
    row = { id: ulid(), userId, type, actorIds: [actorId], target, read: false, createdAt: new Date().toISOString() }
  }
  db.notifications.set(userId, [row, ...inbox])
  mockSocket.emit(userId, { type: 'notification.created', data: toNotification(row) })
  mockSocket.emit(userId, { type: 'unread.changed', data: unreadCounts(userId) })
}

function emitPostStats(postId: string, viewerId: string) {
  const post = db.posts.get(postId)
  if (!post) return
  const { stats } = toPost(post, viewerId)
  db.users.forEach((u) => mockSocket.emit(u.id, { type: 'post.stats', data: { postId, ...stats } }))
}

const REPLIES = [
  'Ha, fair point.',
  'Send me the diagram when you have it!',
  'Have you tried putting a queue in front of it?',
  'That makes sense. What about the failure case?',
  'I would start with the simplest version and measure.',
  'Agreed. Let me think about it and get back to you.',
]

/** Other members "reply" a moment later so chat, typing and unread badges can be exercised. */
function simulateReply(conversationId: string, me: string) {
  const convo = db.conversations.get(conversationId)
  const responder = convo?.memberIds.find((id) => id !== me)
  if (!convo || !responder) return
  later(700, () =>
    convo.memberIds.forEach((m) => mockSocket.emit(m, { type: 'typing', data: { conversationId, userId: responder } })),
  )
  later(2400, () => {
    const row: MessageRow = {
      id: ulid(),
      conversationId,
      clientMessageId: crypto.randomUUID(),
      senderId: responder,
      text: REPLIES[Math.floor(Math.random() * REPLIES.length)],
      mediaIds: [],
      replyToId: null,
      createdAt: new Date().toISOString(),
    }
    db.messages.get(conversationId)!.push(row)
    convo.updatedAt = row.createdAt
    convo.memberIds.forEach((m) => {
      mockSocket.emit(m, { type: 'message.created', data: toMessage(row) })
      mockSocket.emit(m, { type: 'unread.changed', data: unreadCounts(m) })
    })
  })
}

function validationError(fields: Record<string, string>) {
  return problem(
    422,
    'Validation failed',
    'Check the highlighted fields.',
    Object.entries(fields).map(([field, message]) => ({ field, message })),
  )
}

// ─────────────────────────── handlers ───────────────────────────

export const handlers = [
  // System
  http.get(`${BASE}/health`, () =>
    HttpResponse.json<S['Health']>({
      status: 'ok',
      architecture: 'mock',
      version: 'mock-1.0.0',
      time: new Date().toISOString(),
      dependencies: { memory: 'ok' },
    }),
  ),

  // Auth
  http.post(`${BASE}/auth/register`, async ({ request }) => {
    await delay(300)
    const body = (await request.json()) as S['RegisterRequest']
    const errors: Record<string, string> = {}
    if (!/^[a-z0-9_.]{3,30}$/.test(body.username ?? ''))
      errors.username = 'Use 3–30 lowercase letters, numbers, dots or underscores.'
    if ((body.password ?? '').length < 10) errors.password = 'Use at least 10 characters.'
    if (!body.displayName?.trim()) errors.displayName = 'Enter a display name.'
    if (Object.keys(errors).length) return validationError(errors)
    if (userByUsername(body.username))
      return problem(409, 'Conflict', 'That username is taken.', [
        { field: 'username', message: 'That username is taken.' },
      ])
    if ([...db.users.values()].some((u) => u.email === body.email))
      return problem(409, 'Conflict', 'An account with that email exists.', [
        { field: 'email', message: 'An account with that email exists.' },
      ])
    const id = ulid()
    db.users.set(id, {
      id,
      username: body.username,
      displayName: body.displayName,
      email: body.email,
      password: body.password,
      bio: null,
      location: null,
      website: null,
      avatarUrl: null,
      coverUrl: null,
      verified: false,
      createdAt: new Date().toISOString(),
    })
    return HttpResponse.json({ user: toMe(db.users.get(id)!), tokens: issueTokens(id) } satisfies S['AuthSession'], {
      status: 201,
    })
  }),

  http.post(`${BASE}/auth/login`, async ({ request }) => {
    await delay(300)
    const { email, password } = (await request.json()) as S['LoginRequest']
    const user = [...db.users.values()].find((u) => u.email === email && u.password === password)
    if (!user) return problem(401, 'Unauthorized', 'Email or password is incorrect.')
    return HttpResponse.json({ user: toMe(user), tokens: issueTokens(user.id) } satisfies S['AuthSession'])
  }),

  http.post(`${BASE}/auth/refresh`, async ({ request }) => {
    const { refreshToken } = (await request.json()) as { refreshToken: string }
    // The token table lives in memory, so after a reload a well-formed token for a seeded user
    // is accepted once. A real backend would reject any token it has no record of.
    const fromReload = refreshToken.split('.')[1]
    if (!db.refreshTokens.has(refreshToken) && fromReload && db.users.has(fromReload)) {
      db.refreshTokens.set(refreshToken, { userId: fromReload, used: false })
    }
    const row = db.refreshTokens.get(refreshToken)
    if (!row) return problem(401, 'Unauthorized', 'Unknown refresh token.')
    if (row.used) {
      // Reuse detection: someone replayed a rotated token, so revoke every token for this user.
      db.refreshTokens.forEach((r, k) => r.userId === row.userId && db.refreshTokens.delete(k))
      return problem(401, 'Unauthorized', 'Refresh token reuse detected; all sessions revoked.')
    }
    row.used = true
    return HttpResponse.json(issueTokens(row.userId))
  }),

  http.post(`${BASE}/auth/logout`, async ({ request }) => {
    const { refreshToken } = (await request.json()) as { refreshToken: string }
    db.refreshTokens.delete(refreshToken)
    return new HttpResponse(null, { status: 204 })
  }),

  // Users
  http.get(
    `${BASE}/users/me`,
    authed(({ me }) => HttpResponse.json(toMe(userById(me)!))),
  ),

  http.patch(
    `${BASE}/users/me`,
    authed(async ({ request, me }) => {
      const body = (await request.json()) as S['UpdateProfileRequest']
      const user = userById(me)!
      if (body.displayName !== undefined) user.displayName = body.displayName
      if (body.bio !== undefined) user.bio = body.bio
      if (body.location !== undefined) user.location = body.location
      if (body.website !== undefined) user.website = body.website
      if (body.avatarMediaId) user.avatarUrl = db.media.get(body.avatarMediaId)?.variants[0]?.url ?? user.avatarUrl
      if (body.coverMediaId) user.coverUrl = db.media.get(body.coverMediaId)?.variants[0]?.url ?? user.coverUrl
      return HttpResponse.json(toMe(user))
    }),
  ),

  http.get(
    `${BASE}/users/:username`,
    authed<{ username: string }>(({ params, me }) => {
      const user = userByUsername(params.username)
      return user ? HttpResponse.json(toProfile(user, me)) : notFound('That account')
    }),
  ),

  http.get(
    `${BASE}/users/:username/posts`,
    authed<{ username: string }>(({ params, me, request }) => {
      const user = userByUsername(params.username)
      if (!user) return notFound('That account')
      const posts = [...db.posts.values()].filter((p) => p.authorId === user.id && canSee(p, me)).sort(newestFirst)
      const result = page(posts, request)
      return HttpResponse.json({ ...result, data: result.data.map((p) => toPost(p, me)) })
    }),
  ),

  // Social graph
  http.put(
    `${BASE}/users/:username/follow`,
    authed<{ username: string }>(({ params, me }) => {
      const user = userByUsername(params.username)
      if (!user) return notFound('That account')
      if (!follows(me, user.id)) {
        db.follows.add(`${me}>${user.id}`)
        notify(user.id, 'follow', me, { kind: 'user', id: me })
      }
      return HttpResponse.json(relationship(me, user.id))
    }),
  ),

  http.delete(
    `${BASE}/users/:username/follow`,
    authed<{ username: string }>(({ params, me }) => {
      const user = userByUsername(params.username)
      if (!user) return notFound('That account')
      db.follows.delete(`${me}>${user.id}`)
      return HttpResponse.json(relationship(me, user.id))
    }),
  ),

  ...(['followers', 'following'] as const).map((kind) =>
    http.get(
      `${BASE}/users/:username/${kind}`,
      authed<{ username: string }>(({ params, request }) => {
        const user = userByUsername(params.username)
        if (!user) return notFound('That account')
        const ids = [...db.follows]
          .map((f) => f.split('>'))
          .filter(([a, b]) => (kind === 'followers' ? b === user.id : a === user.id))
          .map(([a, b]) => (kind === 'followers' ? a : b))
        const result = page(ids, request)
        return HttpResponse.json({ ...result, data: result.data.map((id) => toSummary(userById(id)!)) })
      }),
    ),
  ),

  http.put(
    `${BASE}/users/:username/block`,
    authed<{ username: string }>(({ params, me }) => {
      const user = userByUsername(params.username)
      if (!user) return notFound('That account')
      db.blocks.add(`${me}>${user.id}`)
      db.follows.delete(`${me}>${user.id}`)
      db.follows.delete(`${user.id}>${me}`)
      return HttpResponse.json(relationship(me, user.id))
    }),
  ),

  http.delete(
    `${BASE}/users/:username/block`,
    authed<{ username: string }>(({ params, me }) => {
      const user = userByUsername(params.username)
      if (!user) return notFound('That account')
      db.blocks.delete(`${me}>${user.id}`)
      return HttpResponse.json(relationship(me, user.id))
    }),
  ),

  http.get(
    `${BASE}/suggestions/users`,
    authed(({ me, request }) => {
      const limit = Number(new URL(request.url).searchParams.get('limit') ?? 5)
      const myFollowing = [...db.users.keys()].filter((id) => follows(me, id))
      const data = [...db.users.values()]
        .filter((u) => u.id !== me && !follows(me, u.id) && !db.blocks.has(`${me}>${u.id}`))
        .map((u) => {
          const mutualCount = myFollowing.filter((f) => follows(f, u.id)).length
          return { ...toSummary(u), mutualCount, reason: mutualCount ? ('mutuals' as const) : ('popular' as const) }
        })
        .sort((a, b) => b.mutualCount - a.mutualCount)
        .slice(0, limit)
      return HttpResponse.json({ data })
    }),
  ),

  // Feed
  http.get(
    `${BASE}/feed`,
    authed(({ me, request }) => {
      const posts = [...db.posts.values()]
        .filter((p) => (p.authorId === me || follows(me, p.authorId)) && canSee(p, me))
        .sort(newestFirst)
      const result = page(posts, request)
      return HttpResponse.json({ ...result, data: result.data.map((p) => toPost(p, me)) })
    }),
  ),

  // Posts
  http.post(
    `${BASE}/posts`,
    authed(async ({ request, me }) => {
      const body = (await request.json()) as S['CreatePostRequest']
      const text = body.text?.trim() ?? ''
      const mediaIds = body.mediaIds ?? []
      if (!text && !mediaIds.length) return validationError({ text: 'Write something or attach media.' })
      if (mediaIds.some((id) => db.media.get(id)?.ownerId !== me))
        return validationError({ mediaIds: 'One of the attachments is not yours.' })
      const row: PostRow = {
        id: ulid(),
        authorId: me,
        text,
        mediaIds,
        visibility: body.visibility ?? 'public',
        sharedPostId: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        version: 1,
      }
      db.posts.set(row.id, row)
      // Someone notices the post a few seconds later, so likes and notifications show up live.
      const fan = [...db.users.keys()].find((id) => id !== me && follows(id, me))
      if (fan) {
        later(4000, () => {
          db.postLikes.add(`${fan}:${row.id}`)
          notify(me, 'post_like', fan, { kind: 'post', id: row.id, preview: text.slice(0, 80) })
          emitPostStats(row.id, me)
        })
      }
      return HttpResponse.json(toPost(row, me), { status: 201, headers: { ETag: `"${row.version}"` } })
    }),
  ),

  http.get(
    `${BASE}/posts/:postId`,
    authed<{ postId: string }>(({ params, me }) => {
      const post = db.posts.get(params.postId)
      if (!post || !canSee(post, me)) return notFound('That post')
      return HttpResponse.json(toPost(post, me), { headers: { ETag: `"${post.version}"` } })
    }),
  ),

  http.patch(
    `${BASE}/posts/:postId`,
    authed<{ postId: string }>(async ({ params, me, request }) => {
      const post = db.posts.get(params.postId)
      if (!post) return notFound('That post')
      if (post.authorId !== me) return problem(403, 'Forbidden', 'You can only edit your own posts.')
      if (request.headers.get('If-Match') !== `"${post.version}"`)
        return problem(412, 'Precondition failed', 'This post changed since you loaded it. Reload and try again.')
      const body = (await request.json()) as S['UpdatePostRequest']
      if (body.text !== undefined) post.text = body.text
      if (body.visibility) post.visibility = body.visibility
      post.version += 1
      post.editedAt = new Date().toISOString()
      return HttpResponse.json(toPost(post, me), { headers: { ETag: `"${post.version}"` } })
    }),
  ),

  http.delete(
    `${BASE}/posts/:postId`,
    authed<{ postId: string }>(({ params, me }) => {
      const post = db.posts.get(params.postId)
      if (!post) return notFound('That post')
      if (post.authorId !== me) return problem(403, 'Forbidden', 'You can only delete your own posts.')
      db.posts.delete(post.id)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.put(
    `${BASE}/posts/:postId/like`,
    authed<{ postId: string }>(({ params, me }) => {
      const post = db.posts.get(params.postId)
      if (!post) return notFound('That post')
      if (!db.postLikes.has(`${me}:${post.id}`)) {
        db.postLikes.add(`${me}:${post.id}`)
        notify(post.authorId, 'post_like', me, { kind: 'post', id: post.id, preview: post.text.slice(0, 80) })
      }
      const likes = toPost(post, me).stats.likes
      return HttpResponse.json<S['LikeState']>({ liked: true, likes })
    }),
  ),

  http.delete(
    `${BASE}/posts/:postId/like`,
    authed<{ postId: string }>(({ params, me }) => {
      const post = db.posts.get(params.postId)
      if (!post) return notFound('That post')
      db.postLikes.delete(`${me}:${post.id}`)
      return HttpResponse.json<S['LikeState']>({ liked: false, likes: toPost(post, me).stats.likes })
    }),
  ),

  http.get(
    `${BASE}/posts/:postId/likes`,
    authed<{ postId: string }>(({ params, request }) => {
      const ids = [...db.postLikes].filter((k) => k.endsWith(`:${params.postId}`)).map((k) => k.split(':')[0])
      const result = page(ids, request)
      return HttpResponse.json({ ...result, data: result.data.map((id) => toSummary(userById(id)!)) })
    }),
  ),

  http.post(
    `${BASE}/posts/:postId/shares`,
    authed<{ postId: string }>(async ({ params, me, request }) => {
      const original = db.posts.get(params.postId)
      if (!original) return notFound('That post')
      const body = ((await request.json().catch(() => ({}))) ?? {}) as { text?: string }
      const row: PostRow = {
        id: ulid(),
        authorId: me,
        text: body.text ?? '',
        mediaIds: [],
        visibility: 'public',
        sharedPostId: original.sharedPostId ?? original.id,
        createdAt: new Date().toISOString(),
        editedAt: null,
        version: 1,
      }
      db.posts.set(row.id, row)
      notify(original.authorId, 'post_share', me, {
        kind: 'post',
        id: original.id,
        preview: original.text.slice(0, 80),
      })
      return HttpResponse.json(toPost(row, me), { status: 201 })
    }),
  ),

  http.put(
    `${BASE}/posts/:postId/bookmark`,
    authed<{ postId: string }>(({ params, me }) => {
      const list = db.bookmarks.get(me) ?? []
      db.bookmarks.set(me, [params.postId, ...list.filter((id) => id !== params.postId)])
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.delete(
    `${BASE}/posts/:postId/bookmark`,
    authed<{ postId: string }>(({ params, me }) => {
      db.bookmarks.set(
        me,
        (db.bookmarks.get(me) ?? []).filter((id) => id !== params.postId),
      )
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get(
    `${BASE}/bookmarks`,
    authed(({ me, request }) => {
      const posts = (db.bookmarks.get(me) ?? []).map((id) => db.posts.get(id)).filter((p): p is PostRow => Boolean(p))
      const result = page(posts, request)
      return HttpResponse.json({ ...result, data: result.data.map((p) => toPost(p, me)) })
    }),
  ),

  // Comments
  http.get(
    `${BASE}/posts/:postId/comments`,
    authed<{ postId: string }>(({ params, me, request }) => {
      const parentId = new URL(request.url).searchParams.get('parentId')
      const comments = [...db.comments.values()]
        .filter((c) => c.postId === params.postId && c.parentId === (parentId ?? null))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const result = page(comments, request)
      return HttpResponse.json({ ...result, data: result.data.map((c) => toComment(c, me)) })
    }),
  ),

  http.post(
    `${BASE}/posts/:postId/comments`,
    authed<{ postId: string }>(async ({ params, me, request }) => {
      const post = db.posts.get(params.postId)
      if (!post) return notFound('That post')
      const body = (await request.json()) as S['CreateCommentRequest']
      if (!body.text?.trim()) return validationError({ text: 'Write a comment first.' })
      const parent = body.parentId ? db.comments.get(body.parentId) : undefined
      const row = {
        id: ulid(),
        postId: post.id,
        parentId: parent ? (parent.parentId ?? parent.id) : null,
        authorId: me,
        text: body.text.trim(),
        createdAt: new Date().toISOString(),
        editedAt: null,
      }
      db.comments.set(row.id, row)
      if (parent)
        notify(parent.authorId, 'comment_reply', me, { kind: 'comment', id: parent.id, preview: row.text.slice(0, 80) })
      notify(post.authorId, 'post_comment', me, { kind: 'post', id: post.id, preview: row.text.slice(0, 80) })
      emitPostStats(post.id, me)
      return HttpResponse.json(toComment(row, me), { status: 201 })
    }),
  ),

  http.patch(
    `${BASE}/comments/:commentId`,
    authed<{ commentId: string }>(async ({ params, me, request }) => {
      const comment = db.comments.get(params.commentId)
      if (!comment) return notFound('That comment')
      if (comment.authorId !== me) return problem(403, 'Forbidden', 'You can only edit your own comments.')
      const { text } = (await request.json()) as { text: string }
      comment.text = text
      comment.editedAt = new Date().toISOString()
      return HttpResponse.json(toComment(comment, me))
    }),
  ),

  http.delete(
    `${BASE}/comments/:commentId`,
    authed<{ commentId: string }>(({ params, me }) => {
      const comment = db.comments.get(params.commentId)
      if (!comment) return notFound('That comment')
      if (comment.authorId !== me && db.posts.get(comment.postId)?.authorId !== me)
        return problem(403, 'Forbidden', 'You cannot delete this comment.')
      db.comments.delete(comment.id)
      db.comments.forEach((c) => c.parentId === comment.id && db.comments.delete(c.id))
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.put(
    `${BASE}/comments/:commentId/like`,
    authed<{ commentId: string }>(({ params, me }) => {
      const comment = db.comments.get(params.commentId)
      if (!comment) return notFound('That comment')
      if (!db.commentLikes.has(`${me}:${comment.id}`)) {
        db.commentLikes.add(`${me}:${comment.id}`)
        notify(comment.authorId, 'comment_like', me, {
          kind: 'comment',
          id: comment.id,
          preview: comment.text.slice(0, 80),
        })
      }
      return HttpResponse.json<S['LikeState']>({ liked: true, likes: toComment(comment, me).likes })
    }),
  ),

  http.delete(
    `${BASE}/comments/:commentId/like`,
    authed<{ commentId: string }>(({ params, me }) => {
      const comment = db.comments.get(params.commentId)
      if (!comment) return notFound('That comment')
      db.commentLikes.delete(`${me}:${comment.id}`)
      return HttpResponse.json<S['LikeState']>({ liked: false, likes: toComment(comment, me).likes })
    }),
  ),

  // Media: pre-signed upload → PUT bytes → complete → async "processing"
  http.post(
    `${BASE}/media/uploads`,
    authed(async ({ me, request }) => {
      const body = (await request.json()) as S['CreateUploadRequest']
      const limit = body.contentType.startsWith('video/') ? 200 * 1024 * 1024 : 15 * 1024 * 1024
      if (body.sizeBytes > limit)
        return problem(413, 'Payload too large', `Files of this type can be up to ${limit / 1024 / 1024} MB.`)
      const id = ulid()
      db.media.set(id, {
        id,
        ownerId: me,
        kind: body.contentType.startsWith('video/') ? 'video' : 'image',
        status: 'pending',
        contentType: body.contentType,
        variants: [],
      })
      db.uploads.set(id, { contentType: body.contentType })
      return HttpResponse.json<S['MediaUpload']>(
        {
          mediaId: id,
          uploadUrl: `${location.origin}/mock/object-store/${id}`,
          method: 'PUT',
          headers: { 'Content-Type': body.contentType },
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
        { status: 201 },
      )
    }),
  ),

  // Stands in for S3 / MinIO. Not part of the API contract.
  http.put('/mock/object-store/:mediaId', async ({ params, request }) => {
    await delay(400)
    const upload = db.uploads.get(params.mediaId as string)
    if (!upload) return new HttpResponse(null, { status: 403 })
    upload.blobUrl = URL.createObjectURL(await request.blob())
    return new HttpResponse(null, { status: 200 })
  }),

  http.post(
    `${BASE}/media/:mediaId/complete`,
    authed<{ mediaId: string }>(({ params, me }) => {
      const media = db.media.get(params.mediaId)
      const upload = db.uploads.get(params.mediaId)
      if (!media || media.ownerId !== me) return notFound('That upload')
      if (!upload?.blobUrl) return problem(409, 'Conflict', 'The file has not been uploaded yet.')
      media.status = 'processing'
      // A worker would generate thumbnails / transcode here.
      later(1500, () => {
        media.status = 'ready'
        media.variants = [{ name: 'original', url: upload.blobUrl! }]
      })
      return HttpResponse.json(toMedia(media), { status: 202 })
    }),
  ),

  http.get(
    `${BASE}/media/:mediaId`,
    authed<{ mediaId: string }>(({ params }) => {
      const media = db.media.get(params.mediaId)
      return media ? HttpResponse.json(toMedia(media)) : notFound('That media')
    }),
  ),

  http.delete(
    `${BASE}/media/:mediaId`,
    authed<{ mediaId: string }>(({ params, me }) => {
      const media = db.media.get(params.mediaId)
      if (!media || media.ownerId !== me) return notFound('That media')
      if ([...db.posts.values()].some((p) => p.mediaIds.includes(media.id)))
        return problem(409, 'Conflict', 'This media is attached to a post.')
      db.media.delete(media.id)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // Stories
  http.get(
    `${BASE}/stories`,
    authed(({ me }) => {
      const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString()
      const live = [...db.stories.values()].filter(
        (s) => s.createdAt > cutoff && (s.authorId === me || follows(me, s.authorId)),
      )
      const byAuthor = new Map<string, typeof live>()
      live
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .forEach((s) => byAuthor.set(s.authorId, [...(byAuthor.get(s.authorId) ?? []), s]))
      const data = [...byAuthor].map(([authorId, stories]) => {
        const mapped = stories.map((s) => ({
          id: s.id,
          author: toSummary(userById(s.authorId)!),
          media: toMedia(db.media.get(s.mediaId)!),
          caption: s.caption,
          createdAt: s.createdAt,
          expiresAt: new Date(Date.parse(s.createdAt) + 24 * 3_600_000).toISOString(),
          seen: db.storyViews.has(`${me}:${s.id}`),
        }))
        return { author: toSummary(userById(authorId)!), stories: mapped, hasUnseen: mapped.some((s) => !s.seen) }
      })
      data.sort(
        (a, b) => Number(b.author.id === me) - Number(a.author.id === me) || Number(b.hasUnseen) - Number(a.hasUnseen),
      )
      return HttpResponse.json({ data })
    }),
  ),

  http.post(
    `${BASE}/stories`,
    authed(async ({ me, request }) => {
      const body = (await request.json()) as { mediaId: string; caption?: string }
      const media = db.media.get(body.mediaId)
      if (!media || media.ownerId !== me) return validationError({ mediaId: 'Upload an image first.' })
      const row = {
        id: ulid(),
        authorId: me,
        mediaId: media.id,
        caption: body.caption ?? null,
        createdAt: new Date().toISOString(),
      }
      db.stories.set(row.id, row)
      return HttpResponse.json(
        {
          id: row.id,
          author: toSummary(userById(me)!),
          media: toMedia(media),
          caption: row.caption,
          createdAt: row.createdAt,
          expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
          seen: true,
          viewCount: 0,
        },
        { status: 201 },
      )
    }),
  ),

  http.delete(
    `${BASE}/stories/:storyId`,
    authed<{ storyId: string }>(({ params, me }) => {
      const story = db.stories.get(params.storyId)
      if (!story || story.authorId !== me) return notFound('That story')
      db.stories.delete(story.id)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.post(
    `${BASE}/stories/:storyId/views`,
    authed<{ storyId: string }>(({ params, me }) => {
      db.storyViews.add(`${me}:${params.storyId}`)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // Chat
  http.get(
    `${BASE}/conversations`,
    authed(({ me, request }) => {
      const convos = [...db.conversations.values()]
        .filter((c) => c.memberIds.includes(me))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const result = page(convos, request)
      return HttpResponse.json({ ...result, data: result.data.map((c) => toConversation(c, me)) })
    }),
  ),

  http.post(
    `${BASE}/conversations`,
    authed(async ({ me, request }) => {
      const body = (await request.json()) as S['CreateConversationRequest']
      const memberIds = [...new Set([me, ...body.memberIds])]
      if (memberIds.some((id) => !db.users.has(id))) return validationError({ memberIds: 'Unknown user.' })
      if (body.type === 'direct') {
        const existing = [...db.conversations.values()].find(
          (c) => c.type === 'direct' && c.memberIds.length === 2 && memberIds.every((m) => c.memberIds.includes(m)),
        )
        if (existing) return HttpResponse.json(toConversation(existing, me))
      }
      const row = {
        id: ulid(),
        type: body.type,
        title: body.type === 'group' ? (body.title ?? null) : null,
        memberIds,
        updatedAt: new Date().toISOString(),
      }
      db.conversations.set(row.id, row)
      db.messages.set(row.id, [])
      return HttpResponse.json(toConversation(row, me), { status: 201 })
    }),
  ),

  http.get(
    `${BASE}/conversations/:conversationId`,
    authed<{ conversationId: string }>(({ params, me }) => {
      const convo = db.conversations.get(params.conversationId)
      if (!convo || !convo.memberIds.includes(me)) return notFound('That conversation')
      return HttpResponse.json(toConversation(convo, me))
    }),
  ),

  http.get(
    `${BASE}/conversations/:conversationId/messages`,
    authed<{ conversationId: string }>(({ params, me, request }) => {
      const convo = db.conversations.get(params.conversationId)
      if (!convo || !convo.memberIds.includes(me)) return notFound('That conversation')
      const newest = [...(db.messages.get(convo.id) ?? [])].reverse()
      const result = page(newest, request)
      return HttpResponse.json({ ...result, data: result.data.map(toMessage) })
    }),
  ),

  http.post(
    `${BASE}/conversations/:conversationId/messages`,
    authed<{ conversationId: string }>(async ({ params, me, request }) => {
      const convo = db.conversations.get(params.conversationId)
      if (!convo || !convo.memberIds.includes(me)) return notFound('That conversation')
      const body = (await request.json()) as S['SendMessageRequest']
      const messages = db.messages.get(convo.id)!
      const duplicate = messages.find((m) => m.clientMessageId === body.clientMessageId)
      if (duplicate) return HttpResponse.json(toMessage(duplicate), { status: 201 })
      if (!body.text?.trim() && !body.mediaIds?.length) return validationError({ text: 'Write a message first.' })
      const row: MessageRow = {
        id: ulid(),
        conversationId: convo.id,
        clientMessageId: body.clientMessageId,
        senderId: me,
        text: body.text?.trim() ?? '',
        mediaIds: body.mediaIds ?? [],
        replyToId: body.replyToId ?? null,
        createdAt: new Date().toISOString(),
      }
      messages.push(row)
      convo.updatedAt = row.createdAt
      db.readMarkers.set(`${convo.id}:${me}`, row.id)
      convo.memberIds.forEach((m) => {
        mockSocket.emit(m, { type: 'message.created', data: toMessage(row) })
        if (m !== me) mockSocket.emit(m, { type: 'unread.changed', data: unreadCounts(m) })
      })
      simulateReply(convo.id, me)
      return HttpResponse.json(toMessage(row), { status: 201 })
    }),
  ),

  http.post(
    `${BASE}/conversations/:conversationId/read`,
    authed<{ conversationId: string }>(async ({ params, me, request }) => {
      const { lastReadMessageId } = (await request.json()) as { lastReadMessageId: string }
      const convo = db.conversations.get(params.conversationId)
      if (!convo) return notFound('That conversation')
      const current = db.readMarkers.get(`${convo.id}:${me}`)
      if (!current || lastReadMessageId > current) db.readMarkers.set(`${convo.id}:${me}`, lastReadMessageId)
      convo.memberIds.forEach((m) =>
        mockSocket.emit(m, {
          type: 'conversation.read',
          data: { conversationId: convo.id, userId: me, lastReadMessageId },
        }),
      )
      mockSocket.emit(me, { type: 'unread.changed', data: unreadCounts(me) })
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // Notifications
  http.get(
    `${BASE}/notifications`,
    authed(({ me, request }) => {
      const unreadOnly = new URL(request.url).searchParams.get('unreadOnly') === 'true'
      const rows = (db.notifications.get(me) ?? []).filter((n) => !unreadOnly || !n.read)
      const result = page(rows, request)
      return HttpResponse.json({ ...result, data: result.data.map(toNotification) })
    }),
  ),

  http.get(
    `${BASE}/notifications/unread-count`,
    authed(({ me }) => HttpResponse.json(unreadCounts(me))),
  ),

  http.post(
    `${BASE}/notifications/:notificationId/read`,
    authed<{ notificationId: string }>(({ params, me }) => {
      const row = db.notifications.get(me)?.find((n) => n.id === params.notificationId)
      if (row) row.read = true
      mockSocket.emit(me, { type: 'unread.changed', data: unreadCounts(me) })
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.post(
    `${BASE}/notifications/read-all`,
    authed(({ me }) => {
      db.notifications.get(me)?.forEach((n) => (n.read = true))
      mockSocket.emit(me, { type: 'unread.changed', data: unreadCounts(me) })
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get(
    `${BASE}/notifications/preferences`,
    authed(({ me }) => HttpResponse.json(db.preferences.get(me) ?? defaultPreferences())),
  ),

  http.put(
    `${BASE}/notifications/preferences`,
    authed(async ({ me, request }) => {
      const body = (await request.json()) as S['NotificationPreferences']
      db.preferences.set(me, body)
      return HttpResponse.json(body)
    }),
  ),

  // Search
  http.get(
    `${BASE}/search`,
    authed(({ me, request }) => {
      const url = new URL(request.url)
      const q = (url.searchParams.get('q') ?? '').toLowerCase().replace(/^#/, '')
      const type = url.searchParams.get('type') ?? 'all'
      const limit = Number(url.searchParams.get('limit') ?? 10)
      const want = (t: string) => type === 'all' || type === t
      const users = want('users')
        ? [...db.users.values()]
            .filter((u) => u.username.includes(q) || u.displayName.toLowerCase().includes(q))
            .slice(0, limit)
            .map(toSummary)
        : []
      const posts = want('posts')
        ? [...db.posts.values()]
            .filter((p) => canSee(p, me) && p.text.toLowerCase().includes(q))
            .sort(newestFirst)
            .slice(0, limit)
            .map((p) => toPost(p, me))
        : []
      const hashtags = want('hashtags')
        ? hashtagCounts()
            .filter((h) => h.tag.includes(q))
            .slice(0, limit)
        : []
      return HttpResponse.json<S['SearchResults']>({ users, posts, hashtags })
    }),
  ),

  http.get(
    `${BASE}/hashtags/trending`,
    authed(({ request }) => {
      const limit = Number(new URL(request.url).searchParams.get('limit') ?? 8)
      return HttpResponse.json({ data: hashtagCounts().slice(0, limit) })
    }),
  ),

  http.get(
    `${BASE}/hashtags/:tag/posts`,
    authed<{ tag: string }>(({ params, me, request }) => {
      const tag = params.tag.toLowerCase()
      const posts = [...db.posts.values()]
        .filter((p) => canSee(p, me) && toPost(p, me).hashtags?.includes(tag))
        .sort(newestFirst)
      const result = page(posts, request)
      return HttpResponse.json({ ...result, data: result.data.map((p) => toPost(p, me)) })
    }),
  ),

  // Moderation
  http.post(
    `${BASE}/reports`,
    authed(() => new HttpResponse(null, { status: 202 })),
  ),

  // Realtime
  http.post(
    `${BASE}/realtime/tickets`,
    authed(({ me }) =>
      HttpResponse.json<S['RealtimeTicket']>(
        {
          ticket: `ticket.${me}.${ulid()}`,
          url: `mock://realtime?ticket=ticket.${me}`,
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        },
        { status: 201 },
      ),
    ),
  ),
]

function hashtagCounts(): S['Hashtag'][] {
  const counts = new Map<string, number>()
  db.posts.forEach((p) =>
    [...p.text.matchAll(/#(\w+)/g)].forEach((m) =>
      counts.set(m[1].toLowerCase(), (counts.get(m[1].toLowerCase()) ?? 0) + 1),
    ),
  )
  return [...counts]
    .map(([tag, postCount]) => ({ tag, postCount, trendScore: postCount }))
    .sort((a, b) => b.postCount - a.postCount)
}

function defaultPreferences(): S['NotificationPreferences'] {
  const types: S['NotificationType'][] = [
    'follow',
    'post_like',
    'post_comment',
    'comment_reply',
    'comment_like',
    'post_share',
    'mention',
    'message',
  ]
  return {
    channels: Object.fromEntries(
      types.map((t) => [t, { inApp: true, email: t === 'follow' || t === 'message', push: t !== 'comment_like' }]),
    ),
  }
}
