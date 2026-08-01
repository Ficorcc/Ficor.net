import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // 允许 wrangler dev 代理时的外部连接
    fs: { strict: false }
  },
  optimizeDeps: {
    exclude: ['photon-rs']
  },
  worker: {
    format: 'es'
  }
});
