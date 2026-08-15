import createClient from 'openapi-fetch';

import type { paths } from './generated/schema';

export const createApiClient = (baseUrl: string) =>
  createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: (...arguments_) => globalThis.fetch(...arguments_),
  });

export type ApiClient = ReturnType<typeof createApiClient>;
