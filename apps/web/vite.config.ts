import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => {
  const development = command === 'serve';
  const actionModule = development
    ? './src/auth/DevelopmentLoginAction.development.tsx'
    : './src/auth/DevelopmentLoginAction.production.tsx';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@mergecom/development-login': fileURLToPath(
          new URL(actionModule, import.meta.url),
        ),
      },
    },
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/u, ''),
          target: 'http://127.0.0.1:3001',
        },
      },
    },
    test: {
      environment: 'jsdom',
      exclude: ['dist/**', 'node_modules/**'],
      setupFiles: './src/test/setup.ts',
    },
  };
});
