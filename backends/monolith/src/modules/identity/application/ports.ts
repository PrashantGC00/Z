import type { User } from '../domain/user.ts'

export type NewRefreshToken = NewAccount['refreshToken'] & { userId: string }

export type ProfilePatch = Partial<{
  displayName: string
  bio: string | null
  location: string | null
  website: string | null
}>

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(encoded: string | null, password: string): Promise<boolean>
}

export interface AccessTokenIssuer {
  issue(userId: string): Promise<{ accessToken: string; expiresIn: number }>
}

export interface RefreshTokenGenerator {
  generate(): { token: string; tokenHash: Buffer }
  hash(token: string): Buffer
}

export interface NewAccount {
  user: { id: string; email: string; username: string; displayName: string }
  passwordHash: string
  refreshToken: { id: string; familyId: string; tokenHash: Buffer; expiresAt: Date }
}

export interface UserRepository {
  createAccount(account: NewAccount): Promise<User>
  findByEmail(email: string): Promise<{ user: User; passwordHash: string } | null>
  findById(userId: string): Promise<User | null>
  updateProfile(userId: string, patch: ProfilePatch, now: Date): Promise<User | null>
  findByUsername(username: string): Promise<User | null>
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>
  claim(tokenHash: Buffer, now: Date): Promise<{ userId: string; familyId: string } | null>
  findByHash(tokenHash: Buffer): Promise<{ familyId: string; usedAt: Date | null; revokedAt: Date | null } | null>
  revokeFamily(familyId: string, now: Date): Promise<void>
  rotate(
    presentedHash: Buffer,
    next: { id: string; tokenHash: Buffer; expiresAt: Date },
    now: Date,
  ): Promise<{ userId: string; familyId: string } | null>
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<{ userId: string } | null>
}
