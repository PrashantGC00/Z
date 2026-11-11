import type { Request, RequestHandler } from 'express'
import { config } from '../../platform/config.ts'
import { newId } from '../../platform/ids.ts'
import { makeLogin } from './application/login.ts'
import { makeRegister } from './application/register.ts'
import { makeAuthRouter } from './http/auth.router.ts'
import { makeAuthenticate, makeRequireAuth } from './http/require-auth.ts'
import { jwtTokenIssuer } from './infra/jwt-issuer.ts'
import { jwtTokenVerifier } from './infra/jwt-verifier.ts'
import { argonPasswordHasher } from './infra/password-hasher.ts'
import { refreshTokenGenerator } from './infra/refresh-token-generator.ts'
import { refreshTokenRepository } from './infra/refresh-token.repository.ts'
import { userRepository } from './infra/user.repository.ts'
import { makeGetMe } from './application/get-me.ts'
import { makeUserRouter } from './http/users.router.ts'
import { makeRefreshToken } from './application/refresh-tokens.ts'
import { makeLogout } from './application/logout.ts'
import { makeUpdateMe } from './application/update-me.ts'
import { makeGetUserProfile } from './application/get-user-profile.ts'

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

const refreshTokens = makeRefreshToken({
  tokenStore: refreshTokenRepository,
  refreshTokens: refreshTokenGenerator,
  accessTokens: jwtTokenIssuer,
  newId,
  now: () => new Date(),
  refreshTtlSeconds: config.REFRESH_TOKEN_TTL_SECONDS,
})

const logout = makeLogout({
  tokenStore: refreshTokenRepository,
  refreshTokens: refreshTokenGenerator,
  now: () => new Date(),
})

const getMe = makeGetMe({ users: userRepository })
const updateMe = makeUpdateMe({ users: userRepository, now: () => new Date() })
const getUserProfile = makeGetUserProfile({ users: userRepository })

export const requireAuth: RequestHandler = makeRequireAuth(jwtTokenVerifier)
const authenticate = makeAuthenticate(jwtTokenVerifier)
export const bearerAuth = async (req: Request): Promise<boolean> => {
  const auth = await authenticate(req.headers.authorization)
  if (!auth) return false
  req.auth = auth
  return true
}

export const identityRouter = makeAuthRouter({ register, login, refreshTokens, logout })
export const userRouter = makeUserRouter({ getMe, requireAuth, updateMe, getUserProfile })
