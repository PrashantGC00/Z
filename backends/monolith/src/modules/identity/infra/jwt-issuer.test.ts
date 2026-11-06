import { importSPKI, jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'
import { config } from '../../../platform/config.ts'
import { jwtTokenIssuer } from './jwt-issuer.ts'

const publicKey = await importSPKI(config.JWT_PUBLIC_KEY, 'EdDSA')

const verify = (token: string) =>
  jwtVerify(token, publicKey, {
    algorithms: ['EdDSA'],
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  })

describe('jwtTokenIssuer', () => {
  const userId = 'user-123'

  it('returns expiresIn as the TTL in seconds', async () => {
    const { expiresIn } = await jwtTokenIssuer.issue(userId)

    expect(expiresIn).toBe(config.ACCESS_TOKEN_TTL_SECONDS)
  })

  it('issues a token that verifies with the public key, issuer and audience', async () => {
    const { accessToken } = await jwtTokenIssuer.issue(userId)

    const { protectedHeader } = await verify(accessToken)

    expect(protectedHeader).toEqual({ alg: 'EdDSA', typ: 'JWT' })
  })

  it('sets sub to the user id', async () => {
    const { accessToken } = await jwtTokenIssuer.issue(userId)

    const { payload } = await verify(accessToken)

    expect(payload.sub).toBe(userId)
  })

  it('sets exp - iat to the configured TTL', async () => {
    const { accessToken } = await jwtTokenIssuer.issue(userId)

    const { payload } = await verify(accessToken)

    expect(payload.exp! - payload.iat!).toBe(config.ACCESS_TOKEN_TTL_SECONDS)
  })

  it('gives every token a unique jti', async () => {
    const a = await verify((await jwtTokenIssuer.issue(userId)).accessToken)
    const b = await verify((await jwtTokenIssuer.issue(userId)).accessToken)

    expect(a.payload.jti).toBeTypeOf('string')
    expect(a.payload.jti).not.toBe(b.payload.jti)
  })
})
