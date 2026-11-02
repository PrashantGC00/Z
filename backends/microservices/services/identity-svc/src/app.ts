import express, { type Application } from 'express'
import cors from 'cors'
import { config } from './config.ts'
import helmet from 'helmet'
import { requestLogger } from './platform/logger.ts'
import { healthRouter } from './platform/health.ts'
import { validateRequests } from './http/validate.ts'
import { ProblemError, problemHandler } from './http/problem.ts'

const app: Application = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use(requestLogger)

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
