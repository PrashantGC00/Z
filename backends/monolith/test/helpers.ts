import type { NewAccount } from '../src/modules/identity/application/ports.ts'
import type { User } from '../src/modules/identity/domain/user.ts'
import { refreshTokenGenerator } from '../src/modules/identity/infra/refresh-token-generator.ts'
import { newId } from '../src/platform/ids.ts'

export const build = (): NewAccount => {
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

export const NOW = new Date('2026-01-01T00:00:00.000Z')
export const someUser: User = {
  id: 'user-1',
  email: 'ada@x.com',
  username: 'ada',
  displayName: 'Ada',
  bio: null,
  location: null,
  website: null,
  avatarMediaId: null,
  coverMediaId: null,
  verified: false,
  postsCount: 0,
  followersCount: 0,
  followingCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
}
