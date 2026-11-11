import { NotAuthorized } from '../domain/errors.ts'
import type { UserRepository } from './ports.ts'

export type GetMeDeps = {
  users: Pick<UserRepository, 'findById'>
}

export const makeGetMe = (deps: GetMeDeps) => async (userId: string) => {
  const user = await deps.users.findById(userId)
  if (!user) throw new NotAuthorized()
  return user
}
