import { ProblemError } from '../../../platform/http/problem.ts'
import type { Relationship } from '../application/get-user-profile.ts'
import {
  EmailTaken,
  InvalidCredentials,
  InvalidRefreshToken,
  NotAuthorized,
  UsernameTaken,
  UserNotFound,
  ValidationFailed,
} from '../domain/errors.ts'
import type { User } from '../domain/user.ts'

export const toProfile = (u: User, relationship: Relationship | null) => ({
  id: u.id,
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
  relationship,
})

export const toMe = (u: User) => ({
  ...toProfile(u, null),
  email: u.email,
})

export function toProblem(err: unknown): unknown {
  if (err instanceof ValidationFailed) return new ProblemError(422, 'Validation failed', undefined, err.errors)
  if (err instanceof EmailTaken) return new ProblemError(409, 'Conflict', err.message)
  if (err instanceof UsernameTaken) return new ProblemError(409, 'Conflict', err.message)
  if (err instanceof InvalidCredentials) return new ProblemError(401, 'Unauthorized', err.message)
  if (err instanceof NotAuthorized) return new ProblemError(401, 'Unauthorized', err.message)
  if (err instanceof InvalidRefreshToken) return new ProblemError(401, 'Unauthorized', err.message)
  if (err instanceof UserNotFound) return new ProblemError(404, 'Not Found')
  return err
}
