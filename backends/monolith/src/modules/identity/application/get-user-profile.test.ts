import { describe, expect, it, vi } from 'vitest'
import { UserNotFound } from '../domain/errors.ts'
import type { UserRepository } from './ports.ts'
import { makeGetUserProfile } from './get-user-profile.ts'
import { someUser } from '../../../../test/helpers.ts'

describe('getUserProfile', () => {
  it('returns the user and default relationship for another user', async () => {
    const findByUsername = vi.fn<UserRepository['findByUsername']>(async () => someUser)

    const getUserProfile = makeGetUserProfile({ users: { findByUsername } })

    const result = await getUserProfile('user-2', someUser.username)

    expect(result.user).toBe(someUser)
    expect(result.relationship).toEqual({
      following: false,
      followedBy: false,
      blocking: false,
    })
  })

  it('returns null relationship when viewing own profile', async () => {
    const findByUsername = vi.fn<UserRepository['findByUsername']>(async () => someUser)

    const getUserProfile = makeGetUserProfile({ users: { findByUsername } })

    const result = await getUserProfile('user-1', someUser.username)

    expect(result.relationship).toBeNull()
  })

  it('throws UserNotFound when username does not exist', async () => {
    const findByUsername = vi.fn<UserRepository['findByUsername']>(async () => null)

    const getUserProfile = makeGetUserProfile({ users: { findByUsername } })

    await expect(getUserProfile('user-2', 'unknown')).rejects.toBeInstanceOf(UserNotFound)
  })

  it('calls findByUsername with the provided username', async () => {
    const findByUsername = vi.fn<UserRepository['findByUsername']>(async () => someUser)

    const getUserProfile = makeGetUserProfile({ users: { findByUsername } })

    await getUserProfile('user-2', 'prashant')

    expect(findByUsername).toHaveBeenCalledWith('prashant')
  })
})
