/**
 * Authentication Context
 *
 * Manages authentication state and token persistence using sessionStorage.
 * Validates token on mount by making an API call to /api/status.
 *
 * SECURITY: Uses sessionStorage (not localStorage) so tokens are automatically
 * cleared when the browser tab/window is closed.
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { getStatus } from '../api/client';
import { getToken, setToken as storeToken, clearToken } from './tokenStorage';

/**
 * Result of a login attempt
 */
export interface LoginResult {
  success: boolean;
  error?: string;
}

/**
 * Authentication context value
 */
export interface AuthContextValue {
  /**
   * Whether user is authenticated (has valid token)
   */
  isAuthenticated: boolean;

  /**
   * Whether initial token validation is in progress
   * True only during app startup while validating stored token
   */
  isLoading: boolean;

  /**
   * Attempt to log in with a token
   * Validates the token via API call before storing
   *
   * @param token - Bearer token to authenticate with
   * @returns Promise resolving to success status and optional error message
   */
  login: (token: string) => Promise<LoginResult>;

  /**
   * Log out and clear stored token
   */
  logout: () => void;
}

/**
 * Authentication context
 * Must be used within AuthProvider
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Authentication provider component
 * Wraps the app and provides auth state to all children
 *
 * On mount, checks for stored token and validates it via API.
 * Invalid or expired tokens are automatically cleared.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check for stored token and validate it
  useEffect(() => {
    const initAuth = async (): Promise<void> => {
      const storedToken = getToken();

      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      // Validate stored token by calling /api/status
      try {
        const result = await getStatus(storedToken);

        if (result.success) {
          // Token is valid, user is authenticated
          setIsAuthenticated(true);
        } else {
          // Token is invalid or expired, clear it
          clearToken();
        }
      } catch {
        clearToken();
      }

      setIsLoading(false);
    };

    void initAuth();
  }, []);

  const login = useCallback(async (token: string): Promise<LoginResult> => {
    try {
      // Validate token by calling /api/status before storing
      const result = await getStatus(token);

      if (!result.success) {
        return {
          success: false,
          error: result.message,
        };
      }

      // Token is valid, store it and mark user as authenticated
      storeToken(token);
      setIsAuthenticated(true);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }, []);

  const logout = useCallback((): void => {
    clearToken();
    setIsAuthenticated(false);
  }, []);

  const value: AuthContextValue = {
    isAuthenticated,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
