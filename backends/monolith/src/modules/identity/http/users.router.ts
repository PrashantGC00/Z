import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import type { makeGetMe } from '../application/get-me.ts'
import { toMe, toProblem } from './presenters.ts'
import type { makeUpdateMe } from '../application/update-me.ts'

type GetMe = ReturnType<typeof makeGetMe>
type UpdateMe = ReturnType<typeof makeUpdateMe>

export const makeUserRouter = (deps: { getMe: GetMe; requireAuth: RequestHandler; updateMe: UpdateMe }): Router => {
  const router = Router()
  //GET /users/me
  router.get('/users/me', deps.requireAuth, async (req, res) => {
    const user = await deps.getMe(req.auth!.userId)
    res.status(200).json(toMe(user))
  })

  router.patch('/users/me', deps.requireAuth, async (req, res) => {
    const user = await deps.updateMe(req.auth!.userId, req.body)
    res.json(toMe(user))
  })

  router.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => next(toProblem(err)))
  return router
}
