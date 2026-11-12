import { createHash, randomBytes } from 'node:crypto'
import type { RefreshTokenGenerator } from '../application/ports.ts'

export const refreshTokenGenerator: RefreshTokenGenerator = {
  hash(token) {
    return createHash('sha256').update(token).digest()
  },

  generate() {
    const token = randomBytes(32).toString('base64url')

    return {
      token,
      tokenHash: refreshTokenGenerator.hash(token),
    }
  },
}
