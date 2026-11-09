import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev the API runs on :4000; the proxy keeps everything same-origin so the session cookie just works.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' } },
  build: { target: 'es2020', sourcemap: false },
});
