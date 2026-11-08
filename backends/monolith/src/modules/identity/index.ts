import { config } from '../../platform/config.ts'
import { newId } from '../../platform/ids.ts'
import { makeRegister } from './application/register.ts'
import { makeAuthRouter } from './http/auth.router.ts'
import { jwtTokenIssuer } from './infra/jwt-issuer.ts'
import { argonPasswordHasher } from './infra/password-hasher.ts'
import { refreshTokenGenerator } from './infra/refresh-token-generator.ts'
import { userRepository } from './infra/user.repository.ts'

const register = makeRegister({
  users: userRepository,
  hasher: argonPasswordHasher,
  accessTokens: jwtTokenIssuer,
  refreshTokens: refreshTokenGenerator,
  newId,
  now: () => new Date(),
  refreshTtlSeconds: config.REFRESH_TOKEN_TTL_SECONDS,
})

export const identityRouter = makeAuthRouter({ register })
