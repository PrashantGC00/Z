import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../../../platform/db/client.ts'
import { EmailTaken, UsernameTaken } from '../domain/errors.ts'
import { credentials, refreshTokens, users } from './schema.ts'
import { userRepository } from './user.repository.ts'
import type { NewAccount } from '../application/ports.ts'
import { newId } from '../../../platform/ids.ts'
import { refreshTokenGenerator } from './refresh-token-generator.ts'

const build = (): NewAccount => {
  const name = newId().toLowerCase()
  return {
    user: { id: newId(), email: `${name}@x.com`, username: name, displayName: 'Ada' },
    passwordHash: 'hash',
    refreshToken: {
      id: newId(),
      familyId: newId(),
      tokenHash: refreshTokenGenerator.generate().tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    },
  }
}

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
