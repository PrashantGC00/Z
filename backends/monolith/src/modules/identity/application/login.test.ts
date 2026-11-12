import { describe, expect, it, vi } from 'vitest'
import { InvalidCredentials } from '../domain/errors.ts'
import { MAX_PASSWORD_LENGTH } from '../domain/user.ts'
import type {
  AccessTokenIssuer,
  PasswordHasher,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UserRepository,
} from './ports.ts'
import { makeLogin } from './login.ts'
import { NOW, someUser } from '../../../../test/helpers.ts'

const TTL = 60 * 60 * 24 * 30
const RAW_PASSWORD = 'testtest'
const RAW_TOKEN = 'thisistoken123'

const validInput = {
  email: 'ada@x.com',
  password: RAW_PASSWORD,
}

const setup = () => {
  let n = 0

  const users = {
    findByEmail: vi.fn<UserRepository['findByEmail']>(async () => ({
      user: someUser,
      passwordHash: 'stored-hash',
    })),
  }

  const hasher = {
    hash: vi.fn<PasswordHasher['hash']>(async () => 'argon2-hash'),
    verify: vi.fn<PasswordHasher['verify']>(async () => true),
  }

  const tokenStore = {
    create: vi.fn<RefreshTokenRepository['create']>(async () => {}),
  }

  const refreshTokens = {
    generate: vi.fn<RefreshTokenGenerator['generate']>(() => ({
      token: RAW_TOKEN,
      tokenHash: Buffer.from('sha256-hash'),
    })),
    hash: vi.fn<RefreshTokenGenerator['hash']>(() => Buffer.from('sha256-hash')),
  }

  const accessTokens = {
    issue: vi.fn<AccessTokenIssuer['issue']>(async () => ({
      accessToken: 'access-jwt',
      expiresIn: 900,
    })),
  }

  const login = makeLogin({
    users,
    hasher,
    tokenStore,
    refreshTokens,
    accessTokens,
    newId: () => `id-${++n}`,
    now: () => NOW,
    refreshTtlSeconds: TTL,
  })

  return { login, users, hasher, tokenStore, accessTokens }
}

describe('login', () => {
  it('returns user and tokens for correct password', async () => {
    const { login, accessTokens } = setup()
    const result = await login(validInput)

    expect(result.user).toBe(someUser)
    expect(result.tokens).toEqual({
      accessToken: 'access-jwt',
      refreshToken: RAW_TOKEN,
      expiresIn: 900,
    })
    expect(accessTokens.issue).toHaveBeenCalledWith(someUser.id)
  })

  it('creates a refresh token with the correct userId and expiresAt', async () => {
    const { login, tokenStore } = setup()
    await login(validInput)

    expect(tokenStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: someUser.id,
        expiresAt: new Date(NOW.getTime() + TTL * 1000),
      }),
    )
  })

  it('rejects unknown email but still verifies against null hash', async () => {
    const { login, users, hasher } = setup()
    users.findByEmail.mockResolvedValueOnce(null)

    await expect(login(validInput)).rejects.toBeInstanceOf(InvalidCredentials)

    expect(hasher.verify).toHaveBeenCalledWith(null, RAW_PASSWORD)
  })

  it('rejects incorrect password without creating a refresh token', async () => {
    const { login, hasher, tokenStore } = setup()
    hasher.verify.mockResolvedValueOnce(false)

    await expect(login(validInput)).rejects.toBeInstanceOf(InvalidCredentials)

    expect(tokenStore.create).not.toHaveBeenCalled()
  })

  it('rejects passwords exceeding MAX_PASSWORD_LENGTH without verifying', async () => {
    const { login, hasher } = setup()

    await expect(login({ ...validInput, password: 'a'.repeat(MAX_PASSWORD_LENGTH + 1) })).rejects.toBeInstanceOf(
      InvalidCredentials,
    )

    expect(hasher.verify).not.toHaveBeenCalled()
  })

  it('allows passwords exactly MAX_PASSWORD_LENGTH characters long', async () => {
    const { login, hasher } = setup()
    const password = 'a'.repeat(MAX_PASSWORD_LENGTH)

    await login({ ...validInput, password })

    expect(hasher.verify).toHaveBeenCalledWith('stored-hash', password)
  })

  it('trims email before looking up the user', async () => {
    const { login, users } = setup()

    await login({ ...validInput, email: '  ADA@X.COM  ' })

    expect(users.findByEmail).toHaveBeenCalledWith('ADA@X.COM')
  })
})
