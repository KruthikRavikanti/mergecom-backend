import { createApiClient } from '@mergecom/contracts';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export const apiClient = createApiClient(apiBaseUrl);
