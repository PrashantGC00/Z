import { Router, type NextFunction, type Request, type Response } from 'express'
import type { makeRegister } from '../application/register.ts'
import { toMe, toProblem } from './presenters.ts'

type Register = ReturnType<typeof makeRegister>

export const makeAuthRouter = (uc: { register: Register }): Router => {
  const router = Router()

  router.post('/auth/register', async (req, res) => {
    const session = await uc.register(req.body)
    res.status(201).json({ user: toMe(session.user), tokens: session.tokens })
  })

  router.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => next(toProblem(err)))
  return router
}
