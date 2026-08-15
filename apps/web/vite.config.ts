import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => {
  const development = command === 'serve';
  const authModule = development
    ? './src/auth/demoAuth.development.ts'
    : './src/auth/demoAuth.production.ts';
  const actionModule = development
    ? './src/auth/DemoLoginAction.development.tsx'
    : './src/auth/DemoLoginAction.production.tsx';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@mergecom/demo-action': fileURLToPath(
          new URL(actionModule, import.meta.url),
        ),
        '@mergecom/demo-auth': fileURLToPath(
          new URL(authModule, import.meta.url),
        ),
      },
    },
    server: {
      host: '0.0.0.0',
    },
    test: {
      environment: 'jsdom',
      exclude: ['dist/**', 'node_modules/**'],
      setupFiles: './src/test/setup.ts',
    },
  };
});
