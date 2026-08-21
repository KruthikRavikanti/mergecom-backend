import { Outlet } from 'react-router-dom';

import { AuthProvider } from './AuthContext';

export function AuthProviderRoute() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
