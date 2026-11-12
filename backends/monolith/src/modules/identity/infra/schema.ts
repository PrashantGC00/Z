import { sql } from 'drizzle-orm'
import { boolean, integer, pgTable, text, timestamp, customType, check, inet, index } from 'drizzle-orm/pg-core'

const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: citext('email').notNull().unique(),
    username: text('username').notNull().unique(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    location: text('location'),
    website: text('website'),
    avatarMediaId: text('avatar_media_id'),
    coverMediaId: text('cover_media_id'),
    verified: boolean('verified').notNull().default(false),

    postsCount: integer('posts_count').notNull().default(0),
    followersCount: integer('followers_count').notNull().default(0),
    followingCount: integer('following_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('users_username_length', sql`length(${t.username}) BETWEEN 3 AND 30`),
    check('users_username_lowercase', sql`${t.username} = lower(${t.username})`),
    check('users_display_name_length', sql`length(${t.displayName}) BETWEEN 1 AND 60`),
    check('users_bio_length', sql`${t.bio} IS NULL OR length(${t.bio}) <= 300`),
    check('users_location_length', sql`${t.location} IS NULL OR length(${t.location}) <= 60`),
    check(
      'users_counts_nonnegative',
      sql`${t.postsCount} >= 0 AND ${t.followersCount} >= 0 AND ${t.followingCount} >= 0`,
    ),
  ],
)

export const credentials = pgTable('credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),

  passwordHash: text('password_hash').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),

    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    familyId: text('family_id').notNull(),

    tokenHash: bytea('token_hash').unique().notNull(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    userAgent: text('user_agent'),
    ip: inet('ip'),
  },
  (t) => [index('refresh_tokens_user_id_idx').on(t.userId), index('refresh_tokens_family_id_idx').on(t.familyId)],
)
