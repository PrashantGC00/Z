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
}
