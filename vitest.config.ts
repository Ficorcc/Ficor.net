import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '$lib': fileURLToPath(new URL('./apps/admin/src/lib', import.meta.url)) },
    preserveSymlinks: true
  },
  test: {
    environment: 'node',
    pool: 'threads',
    include: ['tests/**/*.test.ts', 'apps/admin/tests/**/*.test.ts']
  }
});
