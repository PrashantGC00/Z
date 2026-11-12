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
import { makeTokenBucket } from '../../platform/rate-limit.ts'
import { redis } from '../../platform/redis.ts'
import { rateLimit } from '../../platform/http/rate-limit.ts'

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

const byIp = (req: Request) => req.ip ?? null
const byEmail = (req: Request) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null)
const limits = {
  loginIp: rateLimit('login:ip', makeTokenBucket(redis, config.RATE_LIMIT_LOGIN_IP), byIp),
  loginEmail: rateLimit('login:email', makeTokenBucket(redis, config.RATE_LIMIT_LOGIN_EMAIL), byEmail),
  registerIp: rateLimit('register:ip', makeTokenBucket(redis, config.RATE_LIMIT_REGISTER_IP), byIp),
  refreshIp: rateLimit('refresh:ip', makeTokenBucket(redis, config.RATE_LIMIT_REFRESH_IP), byIp),
}

export const identityRouter = makeAuthRouter({ register, login, refreshTokens, logout, limits })
export const userRouter = makeUserRouter({ getMe, requireAuth, updateMe, getUserProfile })
