import OpenApiValidator from 'express-openapi-validator'
import { config } from '../config.ts'

export const validateRequests = OpenApiValidator.middleware({
  apiSpec: config.OPENAPI_SPEC,
  validateRequests: { allErrors: true },
  validateResponses: false,
  validateSecurity: false,
})
