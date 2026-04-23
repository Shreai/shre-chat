import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default is node (existing server/route tests rely on this).
    // Component tests opt in via `// @vitest-environment jsdom` docblock.
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
