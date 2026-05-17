import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        // Exclude purely type definitions
        'src/types.ts',
        // Exclude entry points and scripts with heavy side-effects (better suited for integration/E2E tests)
        'src/hook.ts',
        'src/setup.ts',
        'src/mcp.ts',
        // Exclude development and debugging tools
        'src/dev-watch.ts',
        'src/debug-wrapper.ts',
        // Exclude test files themselves
        '**/*.test.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
});
