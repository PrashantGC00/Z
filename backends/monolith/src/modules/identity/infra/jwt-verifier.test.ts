import { describe, expect, it } from 'vitest'
import { importPKCS8, SignJWT, UnsecuredJWT } from 'jose'
import { config } from '../../../platform/config.ts'
import { jwtTokenIssuer } from './jwt-issuer.ts'
import { jwtTokenVerifier } from './jwt-verifier.ts'

const privateKey = await importPKCS8(config.JWT_PRIVATE_KEY, 'EdDSA')

const signToken = async (audience: string, expiresAt: number) => {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject('user-1')
    .setIssuer(config.JWT_ISSUER)
    .setAudience(audience)
    .setExpirationTime(expiresAt)
    .sign(privateKey)
}

describe('jwtTokenVerifier', () => {
  it('verifies a token issued by jwtTokenIssuer', async () => {
    const token = await jwtTokenIssuer.issue('user-1')

    await expect(jwtTokenVerifier.verify(token.accessToken)).resolves.toEqual({
      userId: 'user-1',
    })
  })

  it('returns null for a token with a modified signature', async () => {
    const token = await jwtTokenIssuer.issue('user-1')
    const parts = token.accessToken.split('.')

    parts[2] = `${parts[2]![0] === 'A' ? 'B' : 'A'}${parts[2]!.slice(1)}`

    await expect(jwtTokenVerifier.verify(parts.join('.'))).resolves.toBeNull()
  })

  it('returns null for an expired token', async () => {
    const token = await signToken(config.JWT_AUDIENCE, Math.floor(Date.now() / 1000) - 60)

    await expect(jwtTokenVerifier.verify(token)).resolves.toBeNull()
  })

  it('returns null for a token with the wrong audience', async () => {
    const token = await signToken('wrong-audience', Math.floor(Date.now() / 1000) + 60)

    await expect(jwtTokenVerifier.verify(token)).resolves.toBeNull()
  })

  it('returns null for an unsigned alg: none token', async () => {
    const token = new UnsecuredJWT({})
      .setSubject('user-1')
      .setIssuer(config.JWT_ISSUER)
      .setAudience(config.JWT_AUDIENCE)
      .setExpirationTime('1h')
      .encode()

    await expect(jwtTokenVerifier.verify(token)).resolves.toBeNull()
  })

  it('returns null for an invalid JWT', async () => {
    await expect(jwtTokenVerifier.verify('not-a-jwt')).resolves.toBeNull()
  })
})
