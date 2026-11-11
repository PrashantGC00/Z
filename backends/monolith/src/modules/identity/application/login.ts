import { InvalidCredentials } from '../domain/errors.ts'
import { MAX_PASSWORD_LENGTH, normalizeEmail } from '../domain/user.ts'
import type {
  AccessTokenIssuer,
  PasswordHasher,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UserRepository,
} from './ports.ts'

export type LoginDeps = {
  users: Pick<UserRepository, 'findByEmail'>
  tokenStore: Pick<RefreshTokenRepository, 'create'>
  hasher: PasswordHasher
  accessTokens: AccessTokenIssuer
  refreshTokens: RefreshTokenGenerator
  newId: () => string
  now: () => Date
  refreshTtlSeconds: number
}

export type LoginInput = {
  email: string
  password: string
}

export const makeLogin = (deps: LoginDeps) => async (input: LoginInput) => {
  const email = normalizeEmail(input.email)

  if (input.password.length > MAX_PASSWORD_LENGTH) {
    throw new InvalidCredentials()
  }

  const found = await deps.users.findByEmail(email)
  const ok = await deps.hasher.verify(found?.passwordHash ?? null, input.password)

  if (!found || !ok) throw new InvalidCredentials()

  const { token, tokenHash } = deps.refreshTokens.generate()

  const expiresAt = new Date(deps.now().getTime() + deps.refreshTtlSeconds * 1000)

  await deps.tokenStore.create({
    id: deps.newId(),
    familyId: deps.newId(),
    userId: found.user.id,
    tokenHash,
    expiresAt,
  })

  const { accessToken, expiresIn } = await deps.accessTokens.issue(found.user.id)

  return {
    user: found.user,
    tokens: {
      accessToken,
      refreshToken: token,
      expiresIn,
    },
  }
}
