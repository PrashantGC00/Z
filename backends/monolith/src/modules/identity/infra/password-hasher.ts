import { randomBytes } from 'node:crypto'
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'
import type { PasswordHasher } from '../application/ports.ts'

const DUMMY_HASH = await argon2Hash(randomBytes(32).toString('hex'))

export const argonPasswordHasher: PasswordHasher = {
  hash(password) {
    return argon2Hash(password)
  },

  async verify(encoded, password) {
    const exists = encoded !== null

    const valid = await argon2Verify(encoded ?? DUMMY_HASH, password)

    return exists && valid
  },
}
