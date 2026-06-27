import { defineConfig } from 'vite';

// base is set to './' so the static build works under a GitHub Pages subpath.
// The standardization pass (Parts 0 + A–E) may override this; relative base is safe meanwhile.
export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
