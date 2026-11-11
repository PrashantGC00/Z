import type { RequestHandler } from 'express'
import { config } from '../../platform/config.ts'
import { newId } from '../../platform/ids.ts'
import { makeLogin } from './application/login.ts'
import { makeRegister } from './application/register.ts'
import { makeAuthRouter } from './http/auth.router.ts'
import { makeRequireAuth } from './http/require-auth.ts'
import { jwtTokenIssuer } from './infra/jwt-issuer.ts'
import { jwtTokenVerifier } from './infra/jwt-verifier.ts'
import { argonPasswordHasher } from './infra/password-hasher.ts'
import { refreshTokenGenerator } from './infra/refresh-token-generator.ts'
import { refreshTokenRepository } from './infra/refresh-token.repository.ts'
import { userRepository } from './infra/user.repository.ts'
import { makeGetMe } from './application/get-me.ts'
import { makeUserRouter } from './http/users.router.ts'

const register = makeRegister({
  users: userRepository,
  hasher: argonPasswordHasher,
  accessTokens: jwtTokenIssuer,
  refreshTokens: refreshTokenGenerator,
  newId,
  now: () => new Date(),
  refreshTtlSeconds: config.REFRESH_TOKEN_TTL_SECONDS,
})

const login = makeLogin({
  users: userRepository,
  tokenStore: refreshTokenRepository,
  hasher: argonPasswordHasher,
  accessTokens: jwtTokenIssuer,
  refreshTokens: refreshTokenGenerator,
  newId,
  now: () => new Date(),
  refreshTtlSeconds: config.REFRESH_TOKEN_TTL_SECONDS,
})

const getMe = makeGetMe({ users: userRepository })

export const requireAuth: RequestHandler = makeRequireAuth(jwtTokenVerifier)

export const identityRouter = makeAuthRouter({ register, login })
export const userRouter = makeUserRouter({ getMe, requireAuth })
