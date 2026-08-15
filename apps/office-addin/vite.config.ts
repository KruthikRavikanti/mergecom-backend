import { defineConfig } from 'vite';

export default defineConfig({
  build: { sourcemap: true },
  server: { host: '0.0.0.0' },
});
