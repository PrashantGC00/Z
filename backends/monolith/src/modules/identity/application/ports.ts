export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(encoded: string | null, password: string): Promise<boolean>
}
