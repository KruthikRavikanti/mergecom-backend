import { getHttpsServerOptions } from 'office-addin-dev-certs';
import { readFileSync } from 'node:fs';
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

const manifestNames = [
  'manifest.word.xml',
  'manifest.excel.xml',
  'manifest.powerpoint.xml',
] as const;

function officeManifestAssets(): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.slice(1);
        if (!manifestNames.includes(name as (typeof manifestNames)[number])) {
          next();
          return;
        }
        response.setHeader('content-type', 'application/xml; charset=utf-8');
        response.end(
          readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url))),
        );
      });
    },
    generateBundle() {
      for (const name of manifestNames) {
        this.emitFile({
          fileName: name,
          source: readFileSync(
            fileURLToPath(new URL(`./${name}`, import.meta.url)),
          ),
          type: 'asset',
        });
      }
    },
    name: 'mergecom-office-manifest-assets',
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
  plugins: [
    officeManifestAssets(),
    ...(command === 'serve' && mode !== 'test'
      ? [officeDevelopmentCertificates()]
      : []),
  ],
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
