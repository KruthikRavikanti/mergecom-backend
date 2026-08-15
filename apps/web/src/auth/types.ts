export interface AuthUser {
  displayName: string;
  email: string;
  role: 'member';
}

export interface DemoAuthAdapter {
  enabled: boolean;
  readSession: () => AuthUser | null;
  signIn: () => AuthUser;
  signOut: () => void;
}
