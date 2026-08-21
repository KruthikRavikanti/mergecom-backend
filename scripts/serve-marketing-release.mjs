import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const port = Number(process.env.PORT ?? 4173);
const dist = resolve('apps/web/dist');
const publicRouteFiles = new Map([
  ['/', 'index.html'],
  ['/product', 'product/index.html'],
  ['/security', 'security/index.html'],
  ['/support', 'support/index.html'],
  ['/request-access', 'request-access/index.html'],
]);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

function resolveRequestFile(pathname) {
  const publicRoute = publicRouteFiles.get(pathname.replace(/\/$/u, '') || '/');
  if (publicRoute) return resolve(dist, publicRoute);
  const candidate = resolve(dist, `.${pathname}`);
  if (
    candidate.startsWith(`${dist}${sep}`) &&
    existsSync(candidate) &&
    statSync(candidate).isFile()
  ) {
    return candidate;
  }
  return resolve(dist, 'app-shell.html');
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const file = resolveRequestFile(pathname);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader(
    'Content-Type',
    contentTypes.get(extname(file)) ?? 'application/octet-stream',
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.info(
    `Marketing release preview listening on http://127.0.0.1:${port}`,
  );
});
