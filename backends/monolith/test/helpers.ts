import type { NewAccount } from '../src/modules/identity/application/ports.ts'
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
