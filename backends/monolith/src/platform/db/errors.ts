import { DrizzleQueryError } from 'drizzle-orm'

function pgError(err: unknown) {
  const e = err instanceof DrizzleQueryError ? err.cause : err
  return e as { code?: string; constraint?: string }
}

export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const { code, constraint: name } = pgError(err)
  return code === '23505' && name === constraint
}
