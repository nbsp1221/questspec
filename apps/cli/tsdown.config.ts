import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  deps: {
    alwaysBundle: [/^@questspec\/(?:core|preview-contract)(?:\/|$)/],
  },
  sourcemap: true,
});
