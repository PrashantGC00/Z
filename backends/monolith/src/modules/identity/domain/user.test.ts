import { describe, expect, it } from 'vitest'
import {
  normalizeBio,
  normalizeDisplayName,
  normalizeEmail,
  normalizeLocation,
  normalizeWebsite,
  validateBio,
  validateDisplayName,
  validateLocation,
  validatePassword,
  validateUsername,
  validateWebsite,
} from './user.ts'

describe('validatePassword', () => {
  it('accepts 10 characters', () => {
    expect(validatePassword('a'.repeat(10))).toBeNull()
  })

  it('rejects 9 characters', () => {
    expect(validatePassword('a'.repeat(9))?.field).toBe('password')
  })

  it('accepts 128 characters', () => {
    expect(validatePassword('a'.repeat(128))).toBeNull()
  })

  it('rejects 129 characters', () => {
    expect(validatePassword('a'.repeat(129))?.field).toBe('password')
  })
})

describe('normalizeEmail', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeEmail('  ada@example.com  ')).toBe('ada@example.com')
  })

  it('preserves internal whitespace', () => {
    expect(normalizeEmail('ada lovelace@example.com')).toBe('ada lovelace@example.com')
  })
})

describe('normalizeDisplayName', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeDisplayName('  Ada Lovelace  ')).toBe('Ada Lovelace')
  })

  it('preserves internal whitespace', () => {
    expect(normalizeDisplayName('Ada  Lovelace')).toBe('Ada  Lovelace')
  })
})

describe('validateDisplayName', () => {
  it('accepts 1 character', () => {
    expect(validateDisplayName('A')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(validateDisplayName('')?.field).toBe('displayName')
  })

  it('accepts names with spaces', () => {
    expect(validateDisplayName('Ada Lovelace')).toBeNull()
  })

  it('accepts 60 characters', () => {
    expect(validateDisplayName('a'.repeat(60))).toBeNull()
  })

  it('rejects 61 characters', () => {
    expect(validateDisplayName('a'.repeat(61))?.field).toBe('displayName')
  })
})

describe('validateUsername', () => {
  it.each(['ada', 'ada123', 'ada_lovelace', 'ada.lovelace', 'a1_'])('accepts valid username: %s', (username) => {
    expect(validateUsername(username)).toBeNull()
  })

  it('accepts 3 characters', () => {
    expect(validateUsername('ada')).toBeNull()
  })

  it('rejects 2 characters', () => {
    expect(validateUsername('ad')?.field).toBe('username')
  })

  it('accepts 30 characters', () => {
    expect(validateUsername('a'.repeat(30))).toBeNull()
  })

  it('rejects 31 characters', () => {
    expect(validateUsername('a'.repeat(31))?.field).toBe('username')
  })

  it.each(['Ada', 'ADA', 'ada-lovelace', 'ada@lovelace', 'ada lovelace', 'ada!'])(
    'rejects invalid characters: %s',
    (username) => {
      expect(validateUsername(username)?.field).toBe('username')
    },
  )

  it.each([' admin', 'admin ', ' ada', 'ada '])('rejects leading or trailing whitespace: "%s"', (username) => {
    expect(validateUsername(username)?.field).toBe('username')
  })

  it.each(['admin', 'root', 'api', 'settings', 'support'])('rejects reserved username: %s', (username) => {
    expect(validateUsername(username)?.message).toBe('is reserved')
  })
})

describe('normalizeBio', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeBio(' hi ')).toBe('hi')
  })

  it('returns null for empty or whitespace-only strings', () => {
    expect(normalizeBio(' ')).toBeNull()
  })
})

describe('validateBio', () => {
  it('accepts null', () => {
    expect(validateBio(null)).toBeNull()
  })

  it('accepts 300 characters', () => {
    expect(validateBio('a'.repeat(300))).toBeNull()
  })

  it('rejects 301 characters', () => {
    expect(validateBio('a'.repeat(301))?.field).toBe('bio')
  })
})

describe('normalizeLocation', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeLocation(' hi ')).toBe('hi')
  })

  it('returns null for empty or whitespace-only strings', () => {
    expect(normalizeLocation(' ')).toBeNull()
  })
})

describe('validateLocation', () => {
  it('accepts 60 characters', () => {
    expect(validateLocation('a'.repeat(60))).toBeNull()
  })

  it('rejects 61 characters', () => {
    expect(validateLocation('a'.repeat(61))?.field).toBe('location')
  })
})

describe('normalizeWebsite', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeWebsite(' https://ada.dev ')).toBe('https://ada.dev')
  })

  it('returns null for empty or whitespace-only strings', () => {
    expect(normalizeWebsite(' ')).toBeNull()
  })
})

describe('validateWebsite', () => {
  it('accepts a valid HTTPS URL', () => {
    expect(validateWebsite('https://ada.dev')).toBeNull()
  })

  it('rejects an invalid URL', () => {
    expect(validateWebsite('not a url')?.field).toBe('website')
  })

  it('rejects javascript protocol', () => {
    expect(validateWebsite('javascript:alert(1)')?.field).toBe('website')
  })

  it('rejects FTP protocol', () => {
    expect(validateWebsite('ftp://x.com')?.field).toBe('website')
  })

  it('accepts null', () => {
    expect(validateWebsite(null)).toBeNull()
  })
})
