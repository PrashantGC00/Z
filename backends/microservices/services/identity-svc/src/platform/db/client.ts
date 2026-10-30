import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { config } from '../../config.ts'
import { logger } from '../logger.ts'

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 2_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 5_000,
  query_timeout: 6_000,
  idle_in_transaction_session_timeout: 10_000,
})

pool.on('error', (err) => logger.error({ err }, 'idle pg client error'))

export const db = drizzle({ client: pool })

export const checkDBConnection = async () => {
  try {
    await db.execute(sql`SELECT 1`)
    return true
  } catch (err) {
    logger.warn({ err }, 'database health check failed')
    return false
  }
}
