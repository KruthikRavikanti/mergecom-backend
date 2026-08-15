import type { DemoAuthAdapter } from './types';

export const demoAuth: DemoAuthAdapter = {
  enabled: false,
  readSession: () => null,
  signIn: () => {
    throw new Error('Development authentication is unavailable.');
  },
  signOut: () => undefined,
};
