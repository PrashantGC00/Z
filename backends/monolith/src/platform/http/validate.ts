import OpenApiValidator from 'express-openapi-validator'
import { config } from '../config.ts'
import type { Request } from 'express'

type SecurityHandlers = { bearerAuth: (req: Request) => Promise<boolean> }

export const makeValidateRequests = (handlers: SecurityHandlers) =>
  OpenApiValidator.middleware({
    apiSpec: config.OPENAPI_SPEC,
    validateRequests: { allErrors: true },
    validateResponses: false,
    validateSecurity: { handlers },
  })
