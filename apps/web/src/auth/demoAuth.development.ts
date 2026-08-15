import type { DemoAuthAdapter } from './types';

const sessionKey = 'mergecom.demo-session';
const enabled = import.meta.env.VITE_ENABLE_DEMO_AUTH === 'true';
const demoUser = {
  displayName: 'Demo Reviewer',
  email: 'reviewer@example.test',
  role: 'member' as const,
};

export const demoAuth: DemoAuthAdapter = {
  enabled,
  readSession: () =>
    enabled && window.localStorage.getItem(sessionKey) === 'active'
      ? demoUser
      : null,
  signIn: () => {
    if (!enabled) throw new Error('Demo authentication is disabled.');
    window.localStorage.setItem(sessionKey, 'active');
    return demoUser;
  },
  signOut: () => window.localStorage.removeItem(sessionKey),
};
