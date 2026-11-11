import { describe, expect, it, vi } from 'vitest'
import { someUser } from '../../../../test/helpers.ts'
import { makeGetMe } from './get-me.ts'
import { NotAuthorized } from '../domain/errors.ts'

describe('makeGetMe', () => {
  it('returns the user and calls findById with the id', async () => {
    const users = {
      findById: vi.fn(async () => someUser),
    }
    const getMe = makeGetMe({
      users,
    })

    const result = await getMe(someUser.id)

    expect(result).toEqual(someUser)
    expect(users.findById).toHaveBeenCalledWith(someUser.id)
  })

  it('throws NotAuthenticated when the user does not exist', async () => {
    const findById = vi.fn(async () => null)

    const getMe = makeGetMe({
      users: { findById },
    })

    await expect(getMe(someUser.id)).rejects.toBeInstanceOf(NotAuthorized)
  })
})
