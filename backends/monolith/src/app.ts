import express, { type Application } from 'express'
import cors from 'cors'
import { validateRequests } from './platform/http/validate.ts'
import { ProblemError, problemHandler } from './platform/http/problem.ts'
import { healthRouter } from './platform/health.ts'
import { requestContextMiddleware, requestLogger } from './platform/logger.ts'
import { config } from './platform/config.ts'
import helmet from 'helmet'

const app: Application = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(requestLogger)
app.use(requestContextMiddleware)

app.use(helmet())

app.use(
  cors({
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match'],
    exposedHeaders: ['ETag', 'Retry-After', 'X-Request-Id'],
    maxAge: 600,
  }),
)

app.use(express.json())

app.use(healthRouter)

app.use(validateRequests)

app.use((_req, _res, next) => next(new ProblemError(404, 'Not Found')))

app.use(problemHandler)

export default app
