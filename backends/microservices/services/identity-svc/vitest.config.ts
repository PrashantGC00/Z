import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup-env.ts', 'dotenv/config'],
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 60_000,
  },
})
