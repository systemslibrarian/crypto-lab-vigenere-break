// `defineConfig` comes from vitest/config, not vite: it is vite's own
// `defineConfig` widened to accept the `test` block below. As of vite 8 the
// plain `vite` export types its argument as `UserConfigExport`, which has no
// `test` property, so `tsc --noEmit` fails with TS2769. Both helpers are
// identity functions over the config object, so this is a type-only change --
// the emitted bundle is byte-identical.
import { defineConfig } from 'vitest/config';

// base is the GitHub Pages project subpath for this repo (Part C). Served from
// https://systemslibrarian.github.io/crypto-lab-vigenere-break/.
export default defineConfig({
  base: '/crypto-lab-vigenere-break/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
