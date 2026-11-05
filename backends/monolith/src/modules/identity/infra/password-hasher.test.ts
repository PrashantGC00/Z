import { describe, expect, it, vi } from 'vitest'
import { verify } from '@node-rs/argon2'
import { argonPasswordHasher } from './password-hasher.ts'

vi.mock('@node-rs/argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@node-rs/argon2')>()

  return {
    ...actual,
    verify: vi.fn(actual.verify),
  }
})

describe('argonPasswordHasher', () => {
  it('hashes a password using Argon2id', async () => {
    const encoded = await argonPasswordHasher.hash('correct-password')

    expect(encoded).toMatch(/^\$argon2id\$/)
  })

  it('verifies a correct password', async () => {
    const encoded = await argonPasswordHasher.hash('correct-password')

    await expect(argonPasswordHasher.verify(encoded, 'correct-password')).resolves.toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const encoded = await argonPasswordHasher.hash('correct-password')

    await expect(argonPasswordHasher.verify(encoded, 'wrong-password')).resolves.toBe(false)
  })

  it('runs Argon2 verification for an unknown user', async () => {
    vi.mocked(verify).mockClear()

    await expect(argonPasswordHasher.verify(null, 'anything')).resolves.toBe(false)

    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('generates different hashes for the same password', async () => {
    const first = await argonPasswordHasher.hash('correct-password')
    const second = await argonPasswordHasher.hash('correct-password')

    expect(first).not.toBe(second)
  })
})
