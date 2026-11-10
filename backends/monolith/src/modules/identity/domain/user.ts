export const MAX_PASSWORD_LENGTH = 128
export const MIN_PASSWORD_LENGTH = 10

export type Invalid = {
  field: string
  message: string
}

export type User = {
  id: string
  email: string
  username: string
  displayName: string
  bio: string | null
  location: string | null
  website: string | null
  avatarMediaId: string | null
  coverMediaId: string | null
  verified: boolean
  postsCount: number
  followersCount: number
  followingCount: number
  createdAt: Date
  updatedAt: Date
}

const RESERVED_USERNAMES = new Set(['admin', 'root', 'api', 'settings', 'support'])

export function normalizeEmail(email: string): string {
  return email.trim()
}

export function normalizeDisplayName(name: string): string {
  return name.trim()
}

export function validatePassword(pw: string): Invalid | null {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { field: 'password', message: `must be at least ${MIN_PASSWORD_LENGTH} characters` }
  }

  if (pw.length > MAX_PASSWORD_LENGTH) {
    return { field: 'password', message: `must be at most ${MAX_PASSWORD_LENGTH} characters` }
  }

  return null
}

export function validateDisplayName(d: string): Invalid | null {
  if (d.length === 0) {
    return { field: 'displayName', message: 'must be at least 1 character' }
  }

  if (d.length > 60) {
    return { field: 'displayName', message: 'must be at most 60 characters' }
  }

  return null
}

export function validateUsername(u: string): Invalid | null {
  if (u.length < 3 || u.length > 30) {
    return { field: 'username', message: 'must be between 3 and 30 characters' }
  }

  if (!/^[a-z0-9_.]{3,30}$/.test(u)) {
    return {
      field: 'username',
      message: 'must contain only lowercase letters, numbers, underscores, and periods',
    }
  }

  if (RESERVED_USERNAMES.has(u)) {
    return { field: 'username', message: 'is reserved' }
  }

  return null
}
