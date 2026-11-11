import { NotAuthorized, ValidationFailed } from '../domain/errors.ts'
import {
  normalizeBio,
  normalizeDisplayName,
  normalizeLocation,
  normalizeWebsite,
  validateBio,
  validateDisplayName,
  validateLocation,
  validateWebsite,
  type Invalid,
} from '../domain/user.ts'
import type { ProfilePatch, UserRepository } from './ports.ts'

export type UpdateMeInput = ProfilePatch & {
  avatarMediaId?: string
  coverMediaId?: string
}

export type UpdateMeDeps = {
  users: Pick<UserRepository, 'updateProfile'>
  now: () => Date
}

export const makeUpdateMe = (deps: UpdateMeDeps) => async (userId: string, input: UpdateMeInput) => {
  const errors: Invalid[] = []
  const patch: ProfilePatch = {}

  if (input.avatarMediaId !== undefined) {
    errors.push({ field: 'avatarMediaId', message: 'not supported yet' })
  }
  if (input.coverMediaId !== undefined) {
    errors.push({ field: 'coverMediaId', message: 'not supported yet' })
  }
  if (input.displayName !== undefined) {
    patch.displayName = normalizeDisplayName(input.displayName)
    const invalid = validateDisplayName(patch.displayName)
    if (invalid) errors.push(invalid)
  }
  if (input.bio !== undefined) {
    patch.bio = normalizeBio(input.bio)
    const invalid = validateBio(patch.bio)
    if (invalid) errors.push(invalid)
  }
  if (input.location !== undefined) {
    patch.location = normalizeLocation(input.location)
    const invalid = validateLocation(patch.location)
    if (invalid) errors.push(invalid)
  }
  if (input.website !== undefined) {
    patch.website = normalizeWebsite(input.website)
    const invalid = validateWebsite(patch.website)
    if (invalid) errors.push(invalid)
  }
  if (errors.length > 0) {
    throw new ValidationFailed(errors)
  }

  const user = await deps.users.updateProfile(userId, patch, deps.now())
  if (!user) {
    throw new NotAuthorized()
  }

  return user
}
