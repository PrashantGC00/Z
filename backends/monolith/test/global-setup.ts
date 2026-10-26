import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import type { TestProject } from 'vitest/node'

let container: StartedPostgreSqlContainer | undefined

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  const url = container.getConnectionUri()

  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  } catch (err) {
    console.error('globalSetup failed:', err)
    await container.stop()
    throw err
  } finally {
    await pool.end()
  }

  project.provide('databaseUrl', url)
}

export async function teardown() {
  await container?.stop()
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}
