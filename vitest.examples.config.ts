import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    timeout: 30000,
    sequence: {
      // consumer test runs before provider test (alphabetical)
      shuffle: false,
    },
  },
});
