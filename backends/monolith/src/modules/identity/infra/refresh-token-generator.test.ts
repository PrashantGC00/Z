import { describe, expect, it } from 'vitest'
import { refreshTokenGenerator } from './refresh-token-generator.ts'

describe('refreshTokenGenerator', () => {
  describe('generate', () => {
    it('generates a 32-byte base64url token', () => {
      const { token } = refreshTokenGenerator.generate()

      expect(Buffer.from(token, 'base64url')).toHaveLength(32)
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('generates a 32-byte SHA-256 hash', () => {
      const { tokenHash } = refreshTokenGenerator.generate()

      expect(Buffer.isBuffer(tokenHash)).toBe(true)
      expect(tokenHash).toHaveLength(32)
    })

    it('returns a hash matching the generated token', () => {
      const { token, tokenHash } = refreshTokenGenerator.generate()

      expect(refreshTokenGenerator.hash(token)).toEqual(tokenHash)
    })

    it('generates different tokens on successive calls', () => {
      const first = refreshTokenGenerator.generate()
      const second = refreshTokenGenerator.generate()

      expect(first.token).not.toBe(second.token)
    })
  })
})
