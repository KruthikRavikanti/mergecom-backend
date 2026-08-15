import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { demoAuth } from '@mergecom/demo-auth';

import type { AuthUser } from './types';

interface AuthContextValue {
  signInDemo: () => void;
  signOut: () => void;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(demoAuth.readSession);

  const signInDemo = useCallback(() => {
    setUser(demoAuth.signIn());
  }, []);

  const signOut = useCallback(() => {
    demoAuth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ signInDemo, signOut, user }),
    [signInDemo, signOut, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context hooks stay beside their provider so the authentication boundary is explicit.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
