import { importSPKI, jwtVerify } from 'jose'
import { config } from '../../../platform/config.ts'
import type { AccessTokenVerifier } from '../application/ports.ts'

const publicKey = await importSPKI(config.JWT_PUBLIC_KEY, 'EdDSA')

export const jwtTokenVerifier: AccessTokenVerifier = {
  async verify(token) {
    try {
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
        algorithms: ['EdDSA'],
      })

      if (typeof payload.sub !== 'string') return null

      return { userId: payload.sub }
    } catch {
      return null
    }
  },
}
