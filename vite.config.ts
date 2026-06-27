import { defineConfig } from 'vite';

// base is the GitHub Pages project subpath for this repo (Part C). Served from
// https://systemslibrarian.github.io/crypto-lab-vigenere-break/.
export default defineConfig({
  base: '/crypto-lab-vigenere-break/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
