import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // e2e/ — playwright, у него свой раннер: npm run e2e.
  test: { globals: true, environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
