import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Ожидание по умолчанию — 5 с, и его не хватало под полной нагрузкой:
  // файлы идут параллельно, dev-сервер Vite компилирует модули по первому
  // запросу, а половина проверок ждёт круга через IndexedDB. На одиночном
  // прогоне те же сценарии проходили всегда. Это не «повтор до зелёного»
  // (retries здесь намеренно нет), а честный запас на медленный первый круг.
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:5173', actionTimeout: 15_000 },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
