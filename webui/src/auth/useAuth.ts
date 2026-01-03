/**
 * useAuth Hook
 *
 * Convenience hook for accessing the authentication context.
 * Must be used within an AuthProvider.
 */

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthContext';

/**
 * Access authentication context
 *
 * @throws Error if used outside of AuthProvider
 * @returns Authentication context value
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
