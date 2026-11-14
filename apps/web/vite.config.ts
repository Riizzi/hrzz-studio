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
      // preview dos projetos (iframe) e os recursos que a pagina deles pede na raiz
      '/preview': { target: 'http://127.0.0.1:7000', changeOrigin: false, ws: true },
      '^/.*': {
        target: 'http://127.0.0.1:7000',
        changeOrigin: false,
        bypass: (req) => (String(req.headers.referer ?? '').includes('/preview/') ? undefined : req.url),
      },
    },
  },
  preview: { host: '127.0.0.1', port: 7001, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
