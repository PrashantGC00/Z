import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../../platform/db/client.ts'
import type { RefreshTokenRepository } from '../application/ports.ts'
import { refreshTokens } from './schema.ts'

export const refreshTokenRepository: RefreshTokenRepository = {
  async create(token) {
    await db.insert(refreshTokens).values(token)
  },

  async claim(tokenHash, now) {
    const [result] = await db
      .update(refreshTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.usedAt),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .returning({
        userId: refreshTokens.userId,
        familyId: refreshTokens.familyId,
      })

    return result ?? null
  },

  async findByHash(tokenHash) {
    const [result] = await db
      .select({ familyId: refreshTokens.familyId, usedAt: refreshTokens.usedAt, revokedAt: refreshTokens.revokedAt })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)
    return result ?? null
  },

  async revokeFamily(familyId, now) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
  },

  async rotate(presentedHash, next, now) {
    return db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(refreshTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(refreshTokens.tokenHash, presentedHash),
            isNull(refreshTokens.usedAt),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, now),
          ),
        )
        .returning({
          userId: refreshTokens.userId,
          familyId: refreshTokens.familyId,
        })

      if (!claimed) return null

      await tx.insert(refreshTokens).values({
        ...next,
        userId: claimed.userId,
        familyId: claimed.familyId,
      })

      return claimed
    })
  },
}
