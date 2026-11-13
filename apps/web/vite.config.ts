import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite na 7001 (so loopback), com proxy pro servidor na 7000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 7001,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:7000', changeOrigin: false, ws: true },
    },
  },
  preview: { host: '127.0.0.1', port: 7001, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
