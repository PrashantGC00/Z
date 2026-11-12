import { describe, expect, it, vi } from 'vitest'
import { ValidationFailed } from '../domain/errors.ts'
import type { User } from '../domain/user.ts'
import type { AccessTokenIssuer, PasswordHasher, RefreshTokenGenerator, UserRepository } from './ports.ts'
import { makeRegister } from './register.ts'

const NOW = new Date('2026-01-01T00:00:00.000Z')
const TTL = 60 * 60 * 24 * 30
const RAW_PASSWORD = 'correct horse battery staple'
const RAW_TOKEN = 'raw-refresh-token-abc123'

const fakeUser: User = {
  id: 'user-1',
  email: 'Alice@Example.com',
  username: 'alice',
  displayName: 'Alice',
  bio: null,
  location: null,
  website: null,
  avatarMediaId: null,
  coverMediaId: null,
  verified: false,
  postsCount: 0,
  followersCount: 0,
  followingCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
}

const validInput = {
  email: '  Alice@Example.com  ',
  password: RAW_PASSWORD,
  username: 'alice',
  displayName: '  Alice  ',
}

const setup = () => {
  let n = 0
  const users = {
    createAccount: vi.fn<UserRepository['createAccount']>(async () => fakeUser),
  }
  const hasher = {
    hash: vi.fn<PasswordHasher['hash']>(async () => 'argon2-hash'),
    verify: vi.fn<PasswordHasher['verify']>(async () => false),
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

  const register = makeRegister({
    users,
    hasher,
    refreshTokens,
    accessTokens,
    newId: () => `id-${++n}`,
    now: () => NOW,
    refreshTtlSeconds: TTL,
  })

  return { register, users, hasher, accessTokens }
}

describe('register', () => {
  it('returns user and tokens for valid input', async () => {
    const { register, accessTokens } = setup()
    const result = await register(validInput)

    expect(result.user).toBe(fakeUser)
    expect(result.tokens).toEqual({
      accessToken: 'access-jwt',
      refreshToken: RAW_TOKEN,
      expiresIn: 900,
    })
    expect(accessTokens.issue).toHaveBeenCalledWith(fakeUser.id)
  })

  it('passes trimmed email and display name to createAccount', async () => {
    const { register, users } = setup()
    await register(validInput)

    const arg = users.createAccount.mock.calls[0]![0]
    expect(arg.user.email).toBe('Alice@Example.com')
    expect(arg.user.displayName).toBe('Alice')
  })

  it('sets expiresAt to exactly now + TTL', async () => {
    const { register, users } = setup()
    await register(validInput)

    const arg = users.createAccount.mock.calls[0]![0]
    expect(arg.refreshToken.expiresAt).toEqual(new Date(NOW.getTime() + TTL * 1000))
  })

  it('never sends the raw password or raw token to the repository', async () => {
    const { register, users } = setup()
    await register(validInput)

    const arg = users.createAccount.mock.calls[0]![0]
    const serialised = JSON.stringify(arg)

    expect(serialised).not.toContain(RAW_PASSWORD)
    expect(serialised).not.toContain(RAW_TOKEN)
    expect(arg.passwordHash).toBe('argon2-hash')
    expect(arg.refreshToken.tokenHash.toString()).not.toBe(RAW_TOKEN)
  })

  it('rejects a reserved username without touching the repository', async () => {
    const { register, users, hasher } = setup()

    await expect(register({ ...validInput, username: 'admin' })).rejects.toBeInstanceOf(ValidationFailed)
    expect(users.createAccount).not.toHaveBeenCalled()
    expect(hasher.hash).not.toHaveBeenCalled()
  })

  it('collects every validation error at once', async () => {
    const { register } = setup()

    const err = await register({ ...validInput, password: 'short', username: 'x' }).catch((e) => e)

    expect(err).toBeInstanceOf(ValidationFailed)
    expect((err as ValidationFailed).errors.map((e) => e.field)).toEqual(['password', 'username'])
  })
})
