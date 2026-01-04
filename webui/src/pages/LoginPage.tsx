/**
 * Login Page Component
 *
 * Displays login form with configurable authentication mode.
 * Supports two modes via VITE_AUTH_MODE environment variable:
 * - 'token': Single token input field (default)
 * - 'credentials': Username and password input fields
 *
 * Features:
 * - Pre-flight health check to show bot online/offline status
 * - Password input for token (hidden characters)
 * - Loading state during authentication
 * - Inline error messages
 * - Form submission via button or Enter key
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { getHealth } from '../api/client';

/**
 * Bot health status states
 */
type BotStatus = 'loading' | 'online' | 'offline';

/**
 * Authentication mode type
 */
type AuthMode = 'token' | 'credentials';

/**
 * Get authentication mode from environment
 */
function getAuthMode(): AuthMode {
  const mode = import.meta.env.VITE_AUTH_MODE as string | undefined;
  if (mode === 'credentials') {
    return 'credentials';
  }
  return 'token';
}

/**
 * Login page component
 */
export function LoginPage(): JSX.Element {
  const { login, loginWithCredentials } = useAuth();
  const authMode = getAuthMode();

  // Token mode state
  const [token, setToken] = useState('');

  // Credentials mode state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Shared state
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [botStatus, setBotStatus] = useState<BotStatus>('loading');

  // Pre-flight health check on mount
  useEffect(() => {
    const checkHealth = async (): Promise<void> => {
      const result = await getHealth();

      if (result.success && result.data.ready) {
        setBotStatus('online');
      } else {
        setBotStatus('offline');
      }
    };

    void checkHealth();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (authMode === 'token') {
        // Token authentication mode
        const result = await login(token);

        if (!result.success) {
          setError(result.error ?? 'Invalid token. Please check your credentials and try again.');
        }
        // If successful, AuthContext will update and App will redirect
      } else {
        // Credentials authentication mode
        const result = await loginWithCredentials(username, password);

        if (!result.success) {
          setError(result.error ?? 'Invalid credentials. Please check your username and password.');
        }
        // If successful, AuthContext will update and App will redirect
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ShawnBot Admin</h1>
          <p className="text-gray-600">
            {authMode === 'token'
              ? 'Enter your token to continue'
              : 'Enter your credentials to continue'}
          </p>
        </div>

        {/* Bot Status Indicator */}
        <div className="mb-6 flex items-center justify-center">
          {botStatus === 'loading' && (
            <div className="flex items-center text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600 mr-2"></div>
              <span className="text-sm">Checking bot status...</span>
            </div>
          )}
          {botStatus === 'online' && (
            <div className="flex items-center text-green-600">
              <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
              <span className="text-sm font-medium">Bot Online</span>
            </div>
          )}
          {botStatus === 'offline' && (
            <div className="flex items-center text-red-600">
              <div className="h-3 w-3 rounded-full bg-red-500 mr-2"></div>
              <span className="text-sm font-medium">Bot Offline</span>
            </div>
          )}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {authMode === 'token' ? (
            // Token Mode: Single token input
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
                Access Token
              </label>
              <input
                id="token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setError('');
                }}
                disabled={isSubmitting}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Enter your admin token"
                required
              />
            </div>
          ) : (
            // Credentials Mode: Username and password inputs
            <>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md p-3">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              isSubmitting ||
              (authMode === 'token' ? !token.trim() : !username.trim() || !password.trim())
            }
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                Logging in...
              </span>
            ) : (
              'Login'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>This is an authenticated admin interface.</p>
          <p>Contact your administrator for access credentials.</p>
        </div>
      </div>
    </div>
  );
}
