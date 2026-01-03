/**
 * Token Storage Abstraction
 *
 * Uses sessionStorage (not localStorage) for security:
 * - Token only persists for the browser session
 * - Automatically cleared when user closes tab/window
 * - Reduces risk of token leakage across sessions
 */

const TOKEN_KEY = 'admin_api_token';

/**
 * Retrieve the stored authentication token
 *
 * @returns The token string if present, null otherwise
 */
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Store an authentication token
 * Overwrites any existing token
 *
 * @param token - The bearer token to store
 */
export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove the stored authentication token
 * Safe to call even if no token is present
 */
export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}
