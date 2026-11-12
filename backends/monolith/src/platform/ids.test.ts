import { describe, expect, it } from 'vitest'
import { newId } from './ids.ts'

describe('newId', () => {
  it('generates a valid ULID', () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('generates unique IDs', () => {
    expect(newId()).not.toBe(newId())
  })
})
