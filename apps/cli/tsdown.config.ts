import { defineConfig } from 'tsdown';

export default defineConfig({
  deps: {
    alwaysBundle: [/^@questspec\/core(?:\/|$)/u],
  },
  entry: 'src/index.ts',
  outDir: 'dist',
  sourcemap: true,
});
