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

export function normalizeBio(bio: string | null): string | null {
  const normalized = bio?.trim() ?? ''

  return normalized.length === 0 ? null : normalized
}

export function validateBio(bio: string | null): Invalid | null {
  if (bio !== null && bio.length > 300) {
    return { field: 'bio', message: 'must be at most 300 characters' }
  }

  return null
}

export function normalizeLocation(location: string | null): string | null {
  const normalized = location?.trim() ?? ''

  return normalized.length === 0 ? null : normalized
}

export function validateLocation(location: string | null): Invalid | null {
  if (location !== null && location.length > 60) {
    return { field: 'location', message: 'must be at most 60 characters' }
  }

  return null
}

export function normalizeWebsite(website: string | null): string | null {
  const normalized = website?.trim() ?? ''

  return normalized.length === 0 ? null : normalized
}

export function validateWebsite(website: string | null): Invalid | null {
  if (website === null) {
    return null
  }

  try {
    const url = new URL(website)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { field: 'website', message: 'must use http or https' }
    }
  } catch {
    return { field: 'website', message: 'must be a valid URL' }
  }

  return null
}
