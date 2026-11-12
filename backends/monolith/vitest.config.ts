import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['dotenv/config', './test/setup-env.ts'],
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 60_000,
  },
})
