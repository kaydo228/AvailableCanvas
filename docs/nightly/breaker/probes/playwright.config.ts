import { defineConfig } from '@playwright/test';

/**
 * Отдельный раннер для проб ломателя. Не трогает e2e/ проекта:
 * пробы живут в docs/nightly/breaker/probes и запускаются командой
 *   npx playwright test --config=docs/nightly/breaker/probes/playwright.config.ts
 */
export default defineConfig({
  testDir: '.',
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:5173', actionTimeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: './test-results',
  webServer: {
    command: 'npm run dev',
    cwd: '../../../..',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
