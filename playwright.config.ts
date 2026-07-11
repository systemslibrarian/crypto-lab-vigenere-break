import { defineConfig } from '@playwright/test';

// Accessibility (axe-core) gate. Runs against the built preview so the scan sees
// exactly what ships. Base path mirrors vite.config.ts (GitHub Pages subpath).
const PORT = 4330;
const BASE = '/crypto-lab-vigenere-break/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    colorScheme: 'dark',
  },
  projects: [
    { name: 'chromium', use: { channel: undefined, browserName: 'chromium' } },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
