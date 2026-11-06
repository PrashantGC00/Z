import type { User } from '../domain/user.ts'

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
}
