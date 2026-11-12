import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import type { TestProject } from 'vitest/node'
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'

let pg: StartedPostgreSqlContainer | undefined
let redis: StartedRedisContainer | undefined

export async function setup(project: TestProject) {
  ;[pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ])
  const url = pg.getConnectionUri()

  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  } catch (err) {
    console.error('globalSetup failed:', err)
    await pg.stop()
    throw err
  } finally {
    await pool.end()
  }

  project.provide('databaseUrl', url)
  project.provide('redisUrl', redis.getConnectionUrl())
}

export async function teardown() {
  await Promise.all([pg?.stop(), redis?.stop()])
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
    redisUrl: string
  }
}
