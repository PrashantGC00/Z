import type { RequestHandler } from 'express'
import type { AccessTokenVerifier } from '../application/ports.ts'
import { ProblemError } from '../../../platform/http/problem.ts'

const unauthorized = () => new ProblemError(401, 'Unauthorized', 'Missing or invalid access token')

export const makeRequireAuth = (verifier: AccessTokenVerifier): RequestHandler => {
  return async (req, _res, next) => {
    if (!req.headers.authorization) return next(unauthorized())

    const [bearer, token] = req.headers.authorization.split(' ')
    if (bearer?.toLowerCase() !== 'bearer' || !token) return next(unauthorized())

    const auth = await verifier.verify(token)
    if (!auth) return next(unauthorized())
    req.auth = auth
    next()
  }
}
