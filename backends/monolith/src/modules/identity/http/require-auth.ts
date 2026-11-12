import type { AccessTokenVerifier } from '../application/ports.ts'
import { ProblemError, UNAUTHORIZED_DETAIL } from '../../../platform/http/problem.ts'
import type { RequestHandler } from 'express'

const unauthorized = () => new ProblemError(401, 'Unauthorized', UNAUTHORIZED_DETAIL)

export const makeAuthenticate =
  (verifier: AccessTokenVerifier) =>
  async (header: string | undefined): Promise<{ userId: string } | null> => {
    if (!header) return null
    const [scheme, token] = header.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null
    return verifier.verify(token)
  }

export const makeRequireAuth = (verifier: AccessTokenVerifier): RequestHandler => {
  const authenticate = makeAuthenticate(verifier)
  return async (req, _res, next) => {
    const auth = await authenticate(req.headers.authorization)
    if (!auth) return next(unauthorized())
    req.auth = auth
    next()
  }
}
