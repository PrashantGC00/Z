import { z } from 'zod'

const csv = z.string().transform((s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
)

const ARCH = 'microservices' as const

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: csv.default(['http://localhost:5173']),
  DATABASE_URL: z.url(),
  // REDIS_URL: z.url(),
  // S3_ENDPOINT: z.url(),
  // S3_ACCESS_KEY: z.string().min(1),
  // S3_SECRET_KEY: z.string().min(1),
  // S3_BUCKET: z.string().min(1),
  VERSION: z.string().min(1).default('0.0.0'),
  ARCH: z.literal(ARCH).default(ARCH),
  OTEL_EXPORTER: z.url(),
  OPENAPI_SPEC: z.string().default('../../../../api/openapi.yaml'),
  OTEL_SERVICE_NAME: z.string().min(1).default('identity-svc'),
  HEALTH_SERVICES: z
    .string()
    .default('')
    .transform((entry) =>
      entry
        .split(',')
        .filter((x) => x.trim())
        .map((x) => {
          const [name, url] = x.trim().split('=')

          return { name, url }
        }),
    )
    .pipe(
      z.array(
        z.object({
          name: z.string().min(1),
          url: z.url(),
        }),
      ),
    ),
  HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:', z.flattenError(parsed.error).fieldErrors)
  process.exit(1)
}

export const config = parsed.data
