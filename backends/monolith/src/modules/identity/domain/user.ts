export type Invalid = {
  field: string
  message: string
}

const RESERVED_USERNAMES = new Set(['admin', 'root', 'api', 'settings', 'support'])

export function normalizeEmail(email: string): string {
  return email.trim()
}

export function normalizeDisplayName(name: string): string {
  return name.trim()
}

export function validatePassword(pw: string): Invalid | null {
  if (pw.length < 10) {
    return { field: 'password', message: 'must be at least 10 characters' }
  }

  if (pw.length > 128) {
    return { field: 'password', message: 'must be at most 128 characters' }
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
