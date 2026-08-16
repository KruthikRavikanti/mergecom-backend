import { getHttpsServerOptions } from 'office-addin-dev-certs';
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
  build: { sourcemap: true },
  plugins:
    command === 'serve' && mode !== 'test'
      ? [officeDevelopmentCertificates()]
      : [],
  server: { host: '0.0.0.0' },
}));
