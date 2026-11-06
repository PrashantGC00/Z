import { randomUUID } from 'node:crypto'
import { importPKCS8, SignJWT } from 'jose'
import { config } from '../../../platform/config.ts'
import type { AccessTokenIssuer } from '../application/ports.ts'

const privateKey = await importPKCS8(config.JWT_PRIVATE_KEY, 'EdDSA')

export const jwtTokenIssuer: AccessTokenIssuer = {
  async issue(userId: string) {
    const now = Math.floor(Date.now() / 1000)

    const expiresIn = config.ACCESS_TOKEN_TTL_SECONDS
    const exp = now + expiresIn

    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setIssuer(config.JWT_ISSUER)
      .setAudience(config.JWT_AUDIENCE)
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(privateKey)

    return {
      accessToken,
      expiresIn,
    }
  },
}
