import { z } from 'zod'

const csv = z.string().transform((s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
)

const pem = z
  .string()
  .min(1)
  .transform((s) => Buffer.from(s, 'base64').toString('utf8'))

const rate = (fallback: string) =>
  z
    .string()
    .regex(/^\d+\/\d+$/)
    .default(fallback)
    .transform((s: string) => {
      const [count, seconds] = s.split('/').map(Number)
      return { capacity: count!, refillPerSecond: count! / seconds! }
    })

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: csv.default(['http://localhost:5173']),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  S3_ENDPOINT: z.url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  VERSION: z.string().min(1).default('0.0.0'),
  ARCH: z.enum(['monolith', 'hybrid']).default('monolith'),
  OTEL_EXPORTER: z.url(),
  OPENAPI_SPEC: z.string().default('../../api/openapi.yaml'),
  OTEL_SERVICE_NAME: z.string().min(1).default('z-monolith'),
  JWT_PRIVATE_KEY: pem,
  JWT_PUBLIC_KEY: pem,
  JWT_ISSUER: z.string().min(1).default('z-monolith'),
  JWT_AUDIENCE: z.string().min(1).default('z'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  RATE_LIMIT_DEFAULT: rate('300/60'),
  RATE_LIMIT_LOGIN_IP: rate('20/60'),
  RATE_LIMIT_LOGIN_EMAIL: rate('5/300'),
  RATE_LIMIT_REGISTER_IP: rate('5/3600'),
  RATE_LIMIT_REFRESH_IP: rate('60/60'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors)
  process.exit(1)
}

export const config = parsed.data
