import { describe, expect, it, vi } from 'vitest'
import { NotAuthorized, ValidationFailed } from '../domain/errors.ts'
import { makeUpdateMe } from './update-me.ts'
import { NOW, someUser } from '../../../../test/helpers.ts'
import type { UserRepository } from './ports.ts'

const setup = () => {
  const updateProfile = vi.fn<UserRepository['updateProfile']>(async () => someUser)

  const execute = makeUpdateMe({
    users: { updateProfile },
    now: () => NOW,
  })

  return { execute, updateProfile }
}

describe('makeUpdateMe', () => {
  it('normalizes displayName and sends only the supplied field', async () => {
    const { execute, updateProfile } = setup()

    await execute('user-1', { displayName: ' Ada ' })

    expect(updateProfile).toHaveBeenCalledWith('user-1', { displayName: 'Ada' }, NOW)
  })

  it('preserves an explicitly supplied null bio', async () => {
    const { execute, updateProfile } = setup()

    await execute('user-1', { bio: null })

    expect(updateProfile).toHaveBeenCalledWith('user-1', { bio: null }, NOW)
  })

  it('normalizes whitespace-only bio to null', async () => {
    const { execute, updateProfile } = setup()

    await execute('user-1', { bio: ' ' })

    expect(updateProfile).toHaveBeenCalledWith('user-1', { bio: null }, NOW)
  })

  it('rejects an invalid website without calling updateProfile', async () => {
    const { execute, updateProfile } = setup()

    await expect(execute('user-1', { website: 'javascript:x' })).rejects.toBeInstanceOf(ValidationFailed)

    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('rejects unsupported avatarMediaId', async () => {
    const { execute, updateProfile } = setup()

    await expect(execute('user-1', { avatarMediaId: '01H123' })).rejects.toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ field: 'avatarMediaId' })]),
    })

    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('rejects an empty displayName after normalization', async () => {
    const { execute, updateProfile } = setup()

    await expect(execute('user-1', { displayName: ' ' })).rejects.toBeInstanceOf(ValidationFailed)

    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('throws NotAuthorized when updateProfile returns null', async () => {
    const { execute, updateProfile } = setup()

    updateProfile.mockResolvedValue(null)

    await expect(execute('user-1', { bio: 'Hello' })).rejects.toBeInstanceOf(NotAuthorized)

    expect(updateProfile).toHaveBeenCalled()
  })

  it('returns the updated user from the repository', async () => {
    const { execute, updateProfile } = setup()

    const result = await execute('user-1', {
      displayName: 'Ada',
      bio: 'Hello',
    })

    expect(result).toBe(someUser)
    expect(updateProfile).toHaveBeenCalledWith('user-1', { displayName: 'Ada', bio: 'Hello' }, NOW)
  })
})
