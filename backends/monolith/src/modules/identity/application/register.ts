import { ValidationFailed } from '../domain/errors.ts'
import {
  normalizeDisplayName,
  normalizeEmail,
  validateDisplayName,
  validatePassword,
  validateUsername,
  type Invalid,
} from '../domain/user.ts'
import type { AccessTokenIssuer, PasswordHasher, RefreshTokenGenerator, UserRepository } from './ports.ts'

export type RegisterDeps = {
  users: Pick<UserRepository, 'createAccount'>
  hasher: PasswordHasher
  accessTokens: AccessTokenIssuer
  refreshTokens: RefreshTokenGenerator
  newId: () => string
  now: () => Date
  refreshTtlSeconds: number
}

export type RegisterInput = {
  email: string
  password: string
  username: string
  displayName: string
}

export const makeRegister = (deps: RegisterDeps) => async (input: RegisterInput) => {
  const email = normalizeEmail(input.email)
  const displayName = normalizeDisplayName(input.displayName)

  const errors = [
    validatePassword(input.password),
    validateUsername(input.username),
    validateDisplayName(displayName),
  ].filter((e): e is Invalid => e !== null)

  if (errors.length > 0) throw new ValidationFailed(errors)

  const passwordHash = await deps.hasher.hash(input.password)

  const { token, tokenHash } = deps.refreshTokens.generate()

  const expiresAt = new Date(deps.now().getTime() + deps.refreshTtlSeconds * 1000)

  const user = await deps.users.createAccount({
    user: {
      id: deps.newId(),
      email,
      username: input.username,
      displayName,
    },
    passwordHash,
    refreshToken: {
      id: deps.newId(),
      familyId: deps.newId(),
      tokenHash,
      expiresAt,
    },
  })

  const { accessToken, expiresIn } = await deps.accessTokens.issue(user.id)

  return {
    user,
    tokens: {
      accessToken,
      refreshToken: token,
      expiresIn,
    },
  }
}
