import { db } from '../../../platform/db/client.ts'
import type { RefreshTokenRepository } from '../application/ports.ts'
import { refreshTokens } from './schema.ts'

export const refreshTokenRepository: RefreshTokenRepository = {
  async create(token) {
    await db.insert(refreshTokens).values(token)
  },
}
