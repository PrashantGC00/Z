import { UserNotFound } from '../domain/errors.ts'
import type { UserRepository } from './ports.ts'

export type Relationship = { following: boolean; followedBy: boolean; blocking: boolean }

export type GetUserProfileDeps = {
  users: Pick<UserRepository, 'findByUsername'>
}

export const makeGetUserProfile = (deps: GetUserProfileDeps) => async (viewerId: string, username: string) => {
  const user = await deps.users.findByUsername(username)
  if (!user) throw new UserNotFound()
  const relationship: Relationship | null =
    user.id === viewerId
      ? null
      : {
          following: false,
          followedBy: false,
          blocking: false,
        }

  return { user, relationship }
}
