import { defineConfig } from 'vitest/config'

// Unit tests for the parts of GameMate that don't need Electron running.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
