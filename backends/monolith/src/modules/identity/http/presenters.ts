import { ProblemError } from '../../../platform/http/problem.ts'
import { EmailTaken, InvalidCredentials, NotAuthorized, UsernameTaken, ValidationFailed } from '../domain/errors.ts'
import type { User } from '../domain/user.ts'

export const toMe = (u: User) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  displayName: u.displayName,
  verified: u.verified,
  bio: u.bio,
  location: u.location,
  website: u.website,
  avatarUrl: null,
  coverUrl: null,
  createdAt: u.createdAt.toISOString(),
  stats: { posts: u.postsCount, followers: u.followersCount, following: u.followingCount },
  relationship: null,
})

export function toProblem(err: unknown): unknown {
  if (err instanceof ValidationFailed) return new ProblemError(422, 'Validation failed', undefined, err.errors)
  if (err instanceof EmailTaken) return new ProblemError(409, 'Conflict', err.message)
  if (err instanceof UsernameTaken) return new ProblemError(409, 'Conflict', err.message)
  if (err instanceof InvalidCredentials) return new ProblemError(401, 'Unauthorized', err.message)
  if (err instanceof NotAuthorized) return new ProblemError(401, 'Unauthorized', err.message)
  return err
}
