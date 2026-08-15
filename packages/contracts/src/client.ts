import createClient from 'openapi-fetch';

import type { paths } from './generated/schema';

export const createApiClient = (baseUrl: string) =>
  createClient<paths>({ baseUrl });

export type ApiClient = ReturnType<typeof createApiClient>;
