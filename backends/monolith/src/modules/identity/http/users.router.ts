import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import type { makeGetMe } from '../application/get-me.ts'
import { toMe, toProblem } from './presenters.ts'

type GetMe = ReturnType<typeof makeGetMe>

export const makeUserRouter = (deps: { getMe: GetMe; requireAuth: RequestHandler }): Router => {
  const router = Router()
  //GET /users/me
  router.get('/users/me', deps.requireAuth, async (req, res) => {
    const user = await deps.getMe(req.auth!.userId)
    res.status(200).json(toMe(user))
  })

  router.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => next(toProblem(err)))
  return router
}
