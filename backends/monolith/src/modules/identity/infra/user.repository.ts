import { eq } from 'drizzle-orm'
import { db } from '../../../platform/db/client.ts'
import { isUniqueViolation } from '../../../platform/db/errors.ts'
import type { UserRepository } from '../application/ports.ts'
import { EmailTaken, UsernameTaken } from '../domain/errors.ts'
import { credentials, refreshTokens, users } from './schema.ts'

export const userRepository: UserRepository = {
  async createAccount(account) {
    try {
      return await db.transaction(async (tx) => {
        const [user] = await tx.insert(users).values(account.user).returning()

        await tx.insert(credentials).values({ passwordHash: account.passwordHash, userId: account.user.id })
        await tx.insert(refreshTokens).values({ ...account.refreshToken, userId: account.user.id })

        return user!
      })
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_unique')) throw new EmailTaken()
      if (isUniqueViolation(err, 'users_username_unique')) throw new UsernameTaken()

      throw err
    }
  },

  async findByEmail(email) {
    const result = await db
      .select({
        user: users,
        passwordHash: credentials.passwordHash,
      })
      .from(users)
      .innerJoin(credentials, eq(credentials.userId, users.id))
      .where(eq(users.email, email))
      .limit(1)

    return result[0] ?? null
  },

  async findById(userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    return user ?? null
  },

  async updateProfile(userId, patch, now) {
    const [user] = await db
      .update(users)
      .set({ ...patch, updatedAt: now })
      .where(eq(users.id, userId))
      .returning()
    return user ?? null
  },
}
