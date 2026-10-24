import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
