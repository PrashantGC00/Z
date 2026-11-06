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
