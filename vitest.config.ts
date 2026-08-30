import { defineConfig } from 'vitest/config';

const nodeArguments = ['--no-experimental-webstorage'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          environmentOptions: {
            jsdom: {
              url: 'http://localhost/',
            },
          },
          execArgv: nodeArguments,
          include: [
            'tests/contract/**/*.test.ts',
            'tests/regression/**/*.test.ts',
            'tests/unit/**/*.test.ts',
            'tests/preview*.test.{ts,tsx}',
          ],
          name: 'fast',
        },
      },
      {
        test: {
          execArgv: nodeArguments,
          fileParallelism: false,
          include: ['tests/cli.test.ts', 'tests/integration/**/*.test.ts'],
          name: 'integration',
          testTimeout: 30_000,
        },
      },
    ],
  },
});
