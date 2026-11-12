import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../../../platform/db/client.ts'
import { EmailTaken, UsernameTaken } from '../domain/errors.ts'
import { credentials, refreshTokens, users } from './schema.ts'
import { userRepository } from './user.repository.ts'
import { build } from '../../../../test/helpers.ts'

describe('userRepository', () => {
  it('creates user, credentials and refresh token atomically', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const userRows = await db.select().from(users).where(eq(users.id, account.user.id))
    const credentialRows = await db.select().from(credentials).where(eq(credentials.userId, account.user.id))
    const refreshTokenRows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, account.user.id))

    expect(userRows).toHaveLength(1)
    expect(credentialRows).toHaveLength(1)
    expect(refreshTokenRows).toHaveLength(1)
  })

  it('throws EmailTaken when email already exists (case-insensitive)', async () => {
    const accountA = build()
    const accountB = build()

    accountB.user.email = accountA.user.email.toUpperCase()

    await userRepository.createAccount(accountA)

    await expect(userRepository.createAccount(accountB)).rejects.toBeInstanceOf(EmailTaken)
  })

  it('throws UsernameTaken when username already exists', async () => {
    const accountA = build()
    const accountB = build()
    accountB.user.username = accountA.user.username

    await userRepository.createAccount(accountA)

    await expect(userRepository.createAccount(accountB)).rejects.toBeInstanceOf(UsernameTaken)
  })

  it('rolls back the transaction when refresh token insertion fails', async () => {
    const accountA = build()
    const accountB = build()

    accountB.refreshToken.tokenHash = accountA.refreshToken.tokenHash

    await userRepository.createAccount(accountA)

    await expect(userRepository.createAccount(accountB)).rejects.toThrow()

    const userRows = await db.select().from(users).where(eq(users.id, accountB.user.id))

    expect(userRows).toHaveLength(0)
  })
})

describe('findByEmail', () => {
  it('returns the user and passwordHash for an existing email', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const result = await userRepository.findByEmail(account.user.email)

    expect(result).not.toBeNull()
    expect(result?.user.id).toBe(account.user.id)
    expect(result?.passwordHash).toBe(account.passwordHash)
  })

  it('finds a user using an uppercase email', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const result = await userRepository.findByEmail(account.user.email.toUpperCase())

    expect(result).not.toBeNull()
    expect(result?.user.id).toBe(account.user.id)
  })

  it('returns null for an unknown email', async () => {
    const result = await userRepository.findByEmail('unknown@example.com')

    expect(result).toBeNull()
  })
})

describe('findById', () => {
  it('returns the user with the correct id and email', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const result = await userRepository.findById(account.user.id)

    expect(result).not.toBeNull()
    expect(result?.id).toBe(account.user.id)
    expect(result?.email).toBe(account.user.email)
  })

  it('does not expose passwordHash', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const result = await userRepository.findById(account.user.id)

    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty('passwordHash')
  })

  it('returns null for an unknown id', async () => {
    const result = await userRepository.findById(build().user.id)

    expect(result).toBeNull()
  })
})

describe('updateProfile', () => {
  it('updates displayName and returns the updated user', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const now = new Date()
    const result = await userRepository.updateProfile(account.user.id, { displayName: 'New' }, now)

    expect(result?.displayName).toBe('New')
  })

  it('preserves fields missing from the patch', async () => {
    const account = build()

    await userRepository.createAccount(account)

    await userRepository.updateProfile(account.user.id, { bio: 'hi' }, new Date())

    const result = await userRepository.updateProfile(account.user.id, { displayName: 'X' }, new Date())

    expect(result?.bio).toBe('hi')
  })

  it('clears nullable fields when set to null', async () => {
    const account = build()

    await userRepository.createAccount(account)

    await userRepository.updateProfile(account.user.id, { bio: 'hi' }, new Date())

    const result = await userRepository.updateProfile(account.user.id, { bio: null }, new Date())

    expect(result?.bio).toBeNull()
  })

  it('updates updatedAt to the given date', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const now = new Date('2026-11-11T10:00:00.000Z')
    const result = await userRepository.updateProfile(account.user.id, { displayName: 'New' }, now)

    expect(result?.updatedAt).toEqual(now)
  })

  it('returns null for an unknown user id', async () => {
    const result = await userRepository.updateProfile(build().user.id, { displayName: 'New' }, new Date())

    expect(result).toBeNull()
  })

  it('rejects bio exceeding 300 characters', async () => {
    const account = build()

    await userRepository.createAccount(account)

    await expect(userRepository.updateProfile(account.user.id, { bio: 'a'.repeat(301) }, new Date())).rejects.toThrow()
  })
})

describe('findByUsername', () => {
  it('returns the user for an existing username', async () => {
    const account = build()

    await userRepository.createAccount(account)

    const result = await userRepository.findByUsername(account.user.username)

    expect(result).not.toBeNull()
    expect(result?.id).toBe(account.user.id)
    expect(result?.username).toBe(account.user.username)
  })

  it('returns null for an unknown username', async () => {
    const result = await userRepository.findByUsername('unknown_user')

    expect(result).toBeNull()
  })
})
