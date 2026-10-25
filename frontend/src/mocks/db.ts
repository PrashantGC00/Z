import type { components } from '@/api/schema'
import { DEMO_ACCOUNT } from '@/config/demo'
import { seededRandom, ulid } from './ids'

type S = components['schemas']

export interface UserRow {
  id: string
  username: string
  displayName: string
  email: string
  password: string
  bio: string | null
  location: string | null
  website: string | null
  avatarUrl: string | null
  coverUrl: string | null
  verified: boolean
  createdAt: string
}

export interface PostRow {
  id: string
  authorId: string
  text: string
  mediaIds: string[]
  visibility: S['Visibility']
  sharedPostId: string | null
  createdAt: string
  editedAt: string | null
  version: number
}

export interface CommentRow {
  id: string
  postId: string
  parentId: string | null
  authorId: string
  text: string
  createdAt: string
  editedAt: string | null
}

export type MediaRow = S['Media'] & { ownerId: string }

export interface StoryRow {
  id: string
  authorId: string
  mediaId: string
  caption: string | null
  createdAt: string
}

export interface ConversationRow {
  id: string
  type: 'direct' | 'group'
  title: string | null
  memberIds: string[]
  updatedAt: string
}

export interface MessageRow {
  id: string
  conversationId: string
  clientMessageId: string
  senderId: string
  text: string
  mediaIds: string[]
  replyToId: string | null
  createdAt: string
}

export interface NotificationRow {
  id: string
  userId: string
  type: S['NotificationType']
  actorIds: string[]
  target?: S['Notification']['target']
  read: boolean
  createdAt: string
}

export const db = {
  users: new Map<string, UserRow>(),
  follows: new Set<string>(), // `${followerId}>${followeeId}`
  blocks: new Set<string>(),
  posts: new Map<string, PostRow>(),
  postLikes: new Set<string>(), // `${userId}:${postId}`
  bookmarks: new Map<string, string[]>(), // userId → postIds, newest first
  comments: new Map<string, CommentRow>(),
  commentLikes: new Set<string>(),
  media: new Map<string, MediaRow>(),
  uploads: new Map<string, { contentType: string; blobUrl?: string }>(),
  stories: new Map<string, StoryRow>(),
  storyViews: new Set<string>(),
  conversations: new Map<string, ConversationRow>(),
  messages: new Map<string, MessageRow[]>(), // conversationId → oldest first
  readMarkers: new Map<string, string>(), // `${conversationId}:${userId}` → messageId
  notifications: new Map<string, NotificationRow[]>(), // userId → newest first
  preferences: new Map<string, S['NotificationPreferences']>(),
  refreshTokens: new Map<string, { userId: string; used: boolean }>(),
}

// ─────────────────────────── seed ───────────────────────────

const HUES = [212, 168, 24, 280, 340, 96, 196, 48, 4]

function avatar(name: string, i: number): string {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
  const hue = HUES[i % HUES.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 45% 42%)"/><circle cx="50" cy="12" r="22" fill="hsl(${hue} 55% 58%)"/><text x="32" y="41" font-family="system-ui,sans-serif" font-size="24" font-weight="600" fill="#fff" text-anchor="middle">${initials}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const picsum = (seed: string, w = 1200, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`

function seedImage(ownerId: string, seed: string, w = 1200, h = 800): string {
  const id = ulid()
  db.media.set(id, {
    id,
    ownerId,
    kind: 'image',
    status: 'ready',
    contentType: 'image/jpeg',
    width: w,
    height: h,
    variants: [
      { name: 'original', url: picsum(seed, w, h), width: w, height: h },
      {
        name: 'small',
        url: picsum(seed, Math.round(w / 3), Math.round(h / 3)),
        width: Math.round(w / 3),
        height: Math.round(h / 3),
      },
    ],
  })
  return id
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

const PEOPLE: Array<Pick<UserRow, 'username' | 'displayName' | 'bio' | 'location'> & { verified?: boolean }> = [
  {
    username: 'riley.park',
    displayName: 'Riley Park',
    bio: 'Building Z three times over to learn what breaks.',
    location: 'Toronto',
  },
  {
    username: 'maya.chen',
    displayName: 'Maya Chen',
    bio: 'Staff engineer. Queues, caches and the occasional sourdough.',
    location: 'Vancouver',
    verified: true,
  },
  {
    username: 'theo.okafor',
    displayName: 'Theo Okafor',
    bio: 'Film photographer. Shoots on a 1978 Canon AE-1.',
    location: 'Lagos',
  },
  {
    username: 'priya.raman',
    displayName: 'Priya Raman',
    bio: 'SRE. Pager survivor. Writes postmortems for fun.',
    location: 'Bengaluru',
  },
  {
    username: 'jonas.berg',
    displayName: 'Jonas Berg',
    bio: 'Trail runner and Go programmer, in that order.',
    location: 'Oslo',
  },
  {
    username: 'lucia.torres',
    displayName: 'Lucía Torres',
    bio: 'Designing interfaces people do not notice.',
    location: 'Mexico City',
    verified: true,
  },
  {
    username: 'sam.whitfield',
    displayName: 'Sam Whitfield',
    bio: 'Database nerd. Ask me about B-trees.',
    location: 'Leeds',
  },
  {
    username: 'noor.haddad',
    displayName: 'Noor Haddad',
    bio: 'Cooking my way through every regional cuisine.',
    location: 'Amman',
  },
  {
    username: 'kenji.mori',
    displayName: 'Kenji Mori',
    bio: 'Serverless all the things. Cold starts are a state of mind.',
    location: 'Osaka',
  },
]

const POSTS: Array<[author: number, hoursAgo: number, text: string, images?: string[]]> = [
  [
    1,
    1,
    'Moved our notification fan-out from a cron job to an outbox table + Kafka. p99 delivery went from 40s to 900ms. The outbox pattern is underrated. #systemdesign #kafka',
  ],
  [2, 2, 'Golden hour on the lagoon. Portra 400, pushed one stop.', ['lagoon-gold', 'lagoon-boats']],
  [3, 3, 'Postmortem tip: write the timeline before anyone has an opinion about the cause. #sre'],
  [4, 4, 'Ran 32km through the fjord trail this morning. Legs are filing a complaint.', ['fjord-trail']],
  [
    5,
    5,
    'Hot take: most loading spinners should be skeletons, and most skeletons should be nothing at all because the data should already be cached. #ux',
  ],
  [
    6,
    6,
    'Reminder that a composite index on (a, b) does not help a query filtering only on b. Learned this one again today. #postgres',
  ],
  [7, 7, 'Mansaf for twelve. The jameed took two days to get right.', ['mansaf-table']],
  [
    8,
    8,
    'Our Lambda cold starts dropped from 1.2s to 180ms by moving to arm64 and trimming the bundle with esbuild. #serverless #aws',
  ],
  [
    1,
    10,
    'Reading the Dynamo paper again. Every time I notice something new about hinted handoff. #distributedsystems',
  ],
  [2, 12, 'Developing a roll from last weekend. Shadows came out exactly how I wanted.', ['darkroom-roll']],
  [0, 14, 'Day 1 of building Z: wrote the OpenAPI contract first so all three backends have to agree. #systemdesign'],
  [3, 18, 'Chaos day results: we killed a whole AZ and nobody noticed. That is the dream. #sre #resilience'],
  [
    5,
    20,
    'Spent the afternoon making focus rings visible. It is the most important CSS you will write this week. #a11y',
  ],
  [4, 22, 'Generics in Go finally clicked for me when I stopped trying to write Java with them. #golang'],
  [6, 26, 'The write-ahead log is the database. Everything else is a cache. #databases'],
  [7, 28, 'Market haul: za’atar, sumac, fresh labneh and far too many figs.', ['market-figs']],
  [
    8,
    30,
    'Step Functions for the media pipeline: upload → scan → thumbnail → transcode, each step retried independently. Diagram in the replies. #serverless',
  ],
  [
    1,
    34,
    'If your microservices all share one database, you have a distributed monolith with extra latency. #microservices',
  ],
  [2, 40, 'New lens day.', ['lens-street']],
  [
    0,
    46,
    'Which should I build first: the modular monolith or the microservices version? Leaning monolith so I can find the seams before cutting them.',
  ],
]

const COMMENTS: Array<[post: number, author: number, text: string]> = [
  [0, 3, 'Did you need idempotent consumers or did ordering per key cover it?'],
  [0, 6, 'Outbox + CDC is my favourite boring architecture.'],
  [1, 5, 'The colours on the second frame are unreal.'],
  [1, 0, 'What scanner do you use?'],
  [2, 1, 'Pinning this for the next incident review.'],
  [10, 1, 'Contract-first is the right call. You will thank yourself when the gateway shows up.'],
  [10, 8, 'Add x-status per backend so you can track progress. Wait, you did that already.'],
  [19, 1, 'Monolith first. Every time.'],
  [19, 4, 'Monolith, but keep the module boundaries honest.'],
  [19, 8, 'Serverless first and skip the ops homework 😄'],
]

// Fixed time and randomness for user ids: the mock forgets everything on reload, but tokens
// in localStorage name a user id, and that id must still exist so you stay signed in.
const SEED_EPOCH = Date.UTC(2025, 0, 1)

function seed() {
  const rand = seededRandom(42)
  const ids = PEOPLE.map((p, i) => {
    const id = ulid(SEED_EPOCH + i * 86_400_000, rand)
    db.users.set(id, {
      id,
      username: p.username,
      displayName: p.displayName,
      email: i === 0 ? DEMO_ACCOUNT.email : `${p.username.split('.')[0]}@example.com`,
      password: DEMO_ACCOUNT.password,
      bio: p.bio,
      location: p.location,
      website: null,
      avatarUrl: avatar(p.displayName, i),
      coverUrl: picsum(`cover-${p.username}`, 1500, 500),
      verified: Boolean(p.verified),
      createdAt: hoursAgo(24 * 30 * (PEOPLE.length - i)),
    })
    return id
  })

  // Riley follows everyone except Noor; most people follow Riley and each other.
  ids.forEach((a, i) =>
    ids.forEach((b, j) => {
      if (a === b) return
      if (i === 0 && j === 7) return
      if ((i + j) % 3 !== 0 || i === 0 || j === 0) db.follows.add(`${a}>${b}`)
    }),
  )

  const postIds = POSTS.map(([author, h, text, images]) => {
    const id = ulid(Date.parse(hoursAgo(h)))
    db.posts.set(id, {
      id,
      authorId: ids[author],
      text,
      mediaIds: (images ?? []).map((seedKey) => seedImage(ids[author], seedKey)),
      visibility: 'public',
      sharedPostId: null,
      createdAt: hoursAgo(h),
      editedAt: null,
      version: 1,
    })
    ids.forEach((u, k) => {
      if ((k * 7 + h) % 3 === 0 && u !== ids[author]) db.postLikes.add(`${u}:${id}`)
    })
    return id
  })

  COMMENTS.forEach(([post, author, text], k) => {
    const id = ulid()
    const createdAt = new Date(Date.parse(db.posts.get(postIds[post])!.createdAt) + (k + 1) * 600_000).toISOString()
    db.comments.set(id, {
      id,
      postId: postIds[post],
      parentId: null,
      authorId: ids[author],
      text,
      createdAt,
      editedAt: null,
    })
  })

  // Stories from the last few hours.
  ;[
    [1, 2, 'whiteboard'],
    [2, 3, 'film-strip'],
    [4, 5, 'summit'],
    [7, 6, 'bread'],
    [8, 9, 'osaka-night'],
  ].forEach(([author, h, key]) => {
    const authorId = ids[author as number]
    const mediaId = seedImage(authorId, `story-${key}`, 720, 1280)
    const id = ulid()
    db.stories.set(id, { id, authorId, mediaId, caption: null, createdAt: hoursAgo(h as number) })
  })

  // A couple of conversations for Riley.
  const convo = (memberIdx: number[], lines: Array<[number, string, number]>, title: string | null = null) => {
    const id = ulid()
    const memberIds = memberIdx.map((m) => ids[m])
    const messages = lines.map(([sender, text, h]) => ({
      id: ulid(Date.parse(hoursAgo(h))),
      conversationId: id,
      clientMessageId: crypto.randomUUID(),
      senderId: ids[sender],
      text,
      mediaIds: [],
      replyToId: null,
      createdAt: hoursAgo(h),
    }))
    db.conversations.set(id, {
      id,
      type: memberIds.length > 2 ? 'group' : 'direct',
      title,
      memberIds,
      updatedAt: messages.at(-1)!.createdAt,
    })
    db.messages.set(id, messages)
    // Riley has read everything except the last message.
    if (messages.length > 1) db.readMarkers.set(`${id}:${ids[0]}`, messages.at(-2)!.id)
  }
  convo(
    [0, 1],
    [
      [0, 'Any advice on picking a message broker for the microservices build?', 5],
      [
        1,
        'Kafka if you want to learn partitions and consumer groups properly. NATS if you want to ship this weekend.',
        4.9,
      ],
      [0, 'Kafka it is. I want the pain.', 4.8],
      [1, 'Ha. Start with one partition per topic and add more when you can explain why.', 1],
    ],
  )
  convo(
    [0, 3, 8],
    [
      [3, 'Who is on call for the serverless stack this week?', 8],
      [8, 'Me. Nothing to page on yet because nothing is deployed 😅', 7.5],
    ],
    'Infra crew',
  )

  // Seed notifications for Riley.
  const riley = ids[0]
  db.notifications.set(riley, [
    {
      id: ulid(),
      userId: riley,
      type: 'post_like',
      actorIds: [ids[1], ids[4], ids[8]],
      target: { kind: 'post', id: postIds[10], preview: POSTS[10][2].slice(0, 80) },
      read: false,
      createdAt: hoursAgo(0.5),
    },
    {
      id: ulid(),
      userId: riley,
      type: 'post_comment',
      actorIds: [ids[8]],
      target: { kind: 'post', id: postIds[10], preview: COMMENTS[6][2] },
      read: false,
      createdAt: hoursAgo(3),
    },
    {
      id: ulid(),
      userId: riley,
      type: 'follow',
      actorIds: [ids[6]],
      target: { kind: 'user', id: ids[6] },
      read: true,
      createdAt: hoursAgo(20),
    },
  ])
}

seed()

// ─────────────────────────── projections ───────────────────────────

export const userById = (id: string) => db.users.get(id)
export const userByUsername = (username: string) => [...db.users.values()].find((u) => u.username === username)

export function toSummary(u: UserRow): S['UserSummary'] {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, verified: u.verified }
}

export const follows = (a: string, b: string) => db.follows.has(`${a}>${b}`)

export function relationship(viewerId: string, otherId: string): S['Relationship'] {
  return {
    following: follows(viewerId, otherId),
    followedBy: follows(otherId, viewerId),
    blocking: db.blocks.has(`${viewerId}>${otherId}`),
  }
}

export function toProfile(u: UserRow, viewerId: string): S['UserProfile'] {
  const followers = [...db.follows].filter((f) => f.endsWith(`>${u.id}`)).length
  const following = [...db.follows].filter((f) => f.startsWith(`${u.id}>`)).length
  const posts = [...db.posts.values()].filter((p) => p.authorId === u.id).length
  return {
    ...toSummary(u),
    bio: u.bio,
    location: u.location,
    website: u.website,
    coverUrl: u.coverUrl,
    createdAt: u.createdAt,
    stats: { posts, followers, following },
    relationship: u.id === viewerId ? null : relationship(viewerId, u.id),
  }
}

export function toMe(u: UserRow): S['Me'] {
  return { ...toProfile(u, u.id), email: u.email }
}

const countLikes = (postId: string) => [...db.postLikes].filter((k) => k.endsWith(`:${postId}`)).length

export function toPost(p: PostRow, viewerId: string): S['Post'] {
  const author = db.users.get(p.authorId)!
  const shared = p.sharedPostId ? db.posts.get(p.sharedPostId) : undefined
  return {
    id: p.id,
    author: toSummary(author),
    text: p.text,
    media: p.mediaIds
      .map((id) => db.media.get(id))
      .filter((m): m is MediaRow => Boolean(m))
      .map(toMedia),
    hashtags: [...p.text.matchAll(/#(\w+)/g)].map((m) => m[1].toLowerCase()),
    mentions: [],
    visibility: p.visibility,
    sharedPost: shared ? toPost(shared, viewerId) : null,
    stats: {
      likes: countLikes(p.id),
      comments: [...db.comments.values()].filter((c) => c.postId === p.id).length,
      shares: [...db.posts.values()].filter((x) => x.sharedPostId === p.id).length,
    },
    viewer: {
      liked: db.postLikes.has(`${viewerId}:${p.id}`),
      bookmarked: (db.bookmarks.get(viewerId) ?? []).includes(p.id),
    },
    createdAt: p.createdAt,
    editedAt: p.editedAt,
  }
}

export function toMedia(m: MediaRow): S['Media'] {
  const { ownerId: _owner, ...media } = m
  return media
}

export function toComment(c: CommentRow, viewerId: string): S['Comment'] {
  return {
    id: c.id,
    postId: c.postId,
    parentId: c.parentId,
    author: toSummary(db.users.get(c.authorId)!),
    text: c.text,
    likes: [...db.commentLikes].filter((k) => k.endsWith(`:${c.id}`)).length,
    replyCount: [...db.comments.values()].filter((r) => r.parentId === c.id).length,
    viewer: { liked: db.commentLikes.has(`${viewerId}:${c.id}`) },
    createdAt: c.createdAt,
    editedAt: c.editedAt,
  }
}

export function toMessage(m: MessageRow): S['Message'] {
  return {
    id: m.id,
    conversationId: m.conversationId,
    clientMessageId: m.clientMessageId,
    sender: toSummary(db.users.get(m.senderId)!),
    text: m.text,
    media: m.mediaIds
      .map((id) => db.media.get(id))
      .filter((x): x is MediaRow => Boolean(x))
      .map(toMedia),
    replyToId: m.replyToId,
    createdAt: m.createdAt,
  }
}

export function unreadIn(conversationId: string, userId: string): number {
  const messages = db.messages.get(conversationId) ?? []
  const marker = db.readMarkers.get(`${conversationId}:${userId}`)
  return messages.filter((m) => m.senderId !== userId && (!marker || m.id > marker)).length
}

export function toConversation(c: ConversationRow, viewerId: string): S['Conversation'] {
  const last = db.messages.get(c.id)?.at(-1)
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    members: c.memberIds.map((id) => toSummary(db.users.get(id)!)),
    lastMessage: last ? toMessage(last) : null,
    unreadCount: unreadIn(c.id, viewerId),
    updatedAt: c.updatedAt,
  }
}

export function toNotification(n: NotificationRow): S['Notification'] {
  return {
    id: n.id,
    type: n.type,
    actors: n.actorIds.slice(0, 3).map((id) => toSummary(db.users.get(id)!)),
    actorCount: n.actorIds.length,
    target: n.target,
    read: n.read,
    createdAt: n.createdAt,
  }
}

export function unreadCounts(userId: string): S['UnreadCounts'] {
  return {
    notifications: (db.notifications.get(userId) ?? []).filter((n) => !n.read).length,
    messages: [...db.conversations.values()]
      .filter((c) => c.memberIds.includes(userId))
      .reduce((sum, c) => sum + unreadIn(c.id, userId), 0),
  }
}

export function canSee(p: PostRow, viewerId: string): boolean {
  if (p.authorId === viewerId) return true
  if (db.blocks.has(`${p.authorId}>${viewerId}`) || db.blocks.has(`${viewerId}>${p.authorId}`)) return false
  if (p.visibility === 'private') return false
  if (p.visibility === 'followers') return follows(viewerId, p.authorId)
  return true
}
