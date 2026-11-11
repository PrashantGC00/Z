import { Router, type NextFunction, type Request, type Response } from 'express'
import type { makeRegister } from '../application/register.ts'
import { toMe, toProblem } from './presenters.ts'
import type { makeLogin } from '../application/login.ts'
import type { makeRefreshToken } from '../application/refresh-tokens.ts'
import type { makeLogout } from '../application/logout.ts'

type Register = ReturnType<typeof makeRegister>
type Login = ReturnType<typeof makeLogin>
type RefreshToken = ReturnType<typeof makeRefreshToken>
type Logout = ReturnType<typeof makeLogout>

export const makeAuthRouter = (uc: {
  register: Register
  login: Login
  refreshTokens: RefreshToken
  logout: Logout
}): Router => {
  const router = Router()

  router.post('/auth/register', async (req, res) => {
    const session = await uc.register(req.body)
    res.status(201).json({ user: toMe(session.user), tokens: session.tokens })
  })

  router.post('/auth/login', async (req, res) => {
    const session = await uc.login(req.body)
    res.status(200).json({ user: toMe(session.user), tokens: session.tokens })
  })

  router.post('/auth/refresh', async (req, res) => {
    const token = await uc.refreshTokens(req.body.refreshToken)
    res.status(200).json(token)
  })

  router.post('/auth/logout', async (req, res) => {
    await uc.logout(req.body.refreshToken)
    res.status(204).end()
  })

  router.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => next(toProblem(err)))
  return router
}
