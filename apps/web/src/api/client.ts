import { createApiClient } from '@mergecom/contracts';

const defaultApiBaseUrl = new URL('/api', window.location.origin).href.replace(
  /\/$/u,
  '',
);

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;

export const apiClient = createApiClient(apiBaseUrl);

export function apiUrl(path: string): string {
  return `${apiBaseUrl.replace(/\/$/u, '')}${path}`;
}
