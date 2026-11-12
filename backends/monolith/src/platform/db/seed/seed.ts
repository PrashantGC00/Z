import 'dotenv/config'
import { db, pool } from '../client.ts'
import { seed } from './users-seed.ts'

async function main() {
  try {
    await seed(db)
    console.log('Seed completed successfully.')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Seed failed:', error)
  process.exitCode = 1
})
