/**
 * Authentication Module
 *
 * Barrel export for auth-related functionality.
 * Use this for cleaner imports throughout the app.
 */

export { AuthProvider, AuthContext, type AuthContextValue, type LoginResult } from './AuthContext';
export { useAuth } from './useAuth';
export { getToken, setToken, clearToken } from './tokenStorage';
