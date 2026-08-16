import { getHttpsServerOptions } from 'office-addin-dev-certs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

function officeDevelopmentCertificates(): Plugin {
  return {
    apply: 'serve',
    config: async () => ({
      server: { https: await getHttpsServerOptions() },
    }),
    name: 'mergecom-office-development-certificates',
  };
}

export default defineConfig(({ command, mode }) => ({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        officeAuth: fileURLToPath(
          new URL('./office-auth.html', import.meta.url),
        ),
      },
    },
    sourcemap: true,
  },
  plugins:
    command === 'serve' && mode !== 'test'
      ? [officeDevelopmentCertificates()]
      : [],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/u, ''),
        target: 'http://127.0.0.1:3001',
      },
      '/blob': {
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/blob/u, ''),
        target: process.env.VITE_LOCAL_BLOB_ORIGIN ?? 'http://localhost:9000',
      },
    },
  },
}));
