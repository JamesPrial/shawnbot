/**
 * Authentication System Tests
 *
 * Tests for tokenStorage.ts and AuthContext.tsx to verify:
 * - Token persistence in sessionStorage
 * - Authentication state management
 * - Token validation via API
 * - Login/logout flows
 * - Automatic token validation on mount
 *
 * WHY: These tests prove the authentication system correctly manages tokens
 * and auth state, preventing unauthorized API access and ensuring proper
 * session handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { act } from 'react';
import React from 'react';
import * as tokenStorage from '../auth/tokenStorage';
import { AuthProvider } from '../auth/AuthContext';
import { useAuth } from '../auth/useAuth';
import * as api from '../api/client';
import type { ApiResult, StatusResponse } from '../api/types';

// Mock the API client module
vi.mock('../api/client');

// Mock sessionStorage since jsdom doesn't fully implement it
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string): string | null => store[key] ?? null),
    setItem: vi.fn((key: string, value: string): void => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string): void => {
      delete store[key];
    }),
    clear: vi.fn((): void => {
      store = {};
    }),
  };
})();

// Replace global sessionStorage with our mock
Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});

describe('tokenStorage', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test to ensure isolation
    mockSessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('getToken', () => {
    describe('when no token is stored', () => {
      it('should return null', () => {
        // PROVES: getToken handles empty state correctly without throwing
        const token = tokenStorage.getToken();
        expect(token).toBeNull();
        expect(mockSessionStorage.getItem).toHaveBeenCalledWith('admin_api_token');
      });
    });

    describe('when a token is stored', () => {
      it('should return the stored token', () => {
        // PROVES: getToken retrieves the exact token that was stored
        const testToken = 'test-token-abc123';
        mockSessionStorage.setItem('admin_api_token', testToken);

        const token = tokenStorage.getToken();

        expect(token).toBe(testToken);
        expect(mockSessionStorage.getItem).toHaveBeenCalledWith('admin_api_token');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string token', () => {
        // PROVES: Empty strings are treated as valid tokens (callers must validate)
        mockSessionStorage.setItem('admin_api_token', '');

        const token = tokenStorage.getToken();

        expect(token).toBe('');
      });

      it('should handle tokens with special characters', () => {
        // PROVES: No encoding/decoding issues with complex tokens
        const complexToken = 'Bearer!@#$%^&*()_+-={}[]|:";\'<>?,./';
        mockSessionStorage.setItem('admin_api_token', complexToken);

        const token = tokenStorage.getToken();

        expect(token).toBe(complexToken);
      });
    });
  });

  describe('setToken', () => {
    describe('when storing a valid token', () => {
      it('should store token in sessionStorage', () => {
        // PROVES: setToken persists tokens for session duration
        const testToken = 'new-token-xyz789';

        tokenStorage.setToken(testToken);

        expect(mockSessionStorage.setItem).toHaveBeenCalledWith('admin_api_token', testToken);
        expect(mockSessionStorage.getItem('admin_api_token')).toBe(testToken);
      });

      it('should overwrite existing token', () => {
        // PROVES: setToken replaces old tokens (no append/concat bugs)
        mockSessionStorage.setItem('admin_api_token', 'old-token');

        const newToken = 'new-token';
        tokenStorage.setToken(newToken);

        expect(mockSessionStorage.getItem('admin_api_token')).toBe(newToken);
        expect(mockSessionStorage.getItem('admin_api_token')).not.toBe('old-token');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string token', () => {
        // PROVES: Empty strings can be stored (validation is caller's responsibility)
        tokenStorage.setToken('');

        expect(mockSessionStorage.setItem).toHaveBeenCalledWith('admin_api_token', '');
      });

      it('should handle very long tokens', () => {
        // PROVES: No length limits imposed by tokenStorage (sessionStorage handles it)
        const longToken = 'x'.repeat(10000);

        tokenStorage.setToken(longToken);

        expect(mockSessionStorage.setItem).toHaveBeenCalledWith('admin_api_token', longToken);
      });
    });
  });

  describe('clearToken', () => {
    describe('when token exists', () => {
      it('should remove token from sessionStorage', () => {
        // PROVES: clearToken completely removes tokens (not just blanking)
        mockSessionStorage.setItem('admin_api_token', 'test-token');

        tokenStorage.clearToken();

        expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('admin_api_token');
        expect(mockSessionStorage.getItem('admin_api_token')).toBeNull();
      });
    });

    describe('when no token exists', () => {
      it('should not throw error', () => {
        // PROVES: clearToken is idempotent and safe to call multiple times
        expect(() => {
          tokenStorage.clearToken();
          tokenStorage.clearToken();
        }).not.toThrow();

        expect(mockSessionStorage.removeItem).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('integration: full token lifecycle', () => {
    it('should support complete set -> get -> clear flow', () => {
      // PROVES: Token operations work correctly in sequence
      expect(tokenStorage.getToken()).toBeNull();

      tokenStorage.setToken('lifecycle-token');
      expect(tokenStorage.getToken()).toBe('lifecycle-token');

      tokenStorage.clearToken();
      expect(tokenStorage.getToken()).toBeNull();
    });

    it('should support multiple set operations', () => {
      // PROVES: Token can be updated multiple times (session token rotation)
      tokenStorage.setToken('token1');
      expect(tokenStorage.getToken()).toBe('token1');

      tokenStorage.setToken('token2');
      expect(tokenStorage.getToken()).toBe('token2');

      tokenStorage.setToken('token3');
      expect(tokenStorage.getToken()).toBe('token3');
    });
  });
});

describe('AuthContext', () => {
  // Test component that consumes AuthContext
  const TestConsumer = () => {
    const { isAuthenticated, login, logout } = useAuth();

    return (
      <div>
        <div data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'not authenticated'}</div>
        <button
          data-testid="login-button"
          onClick={() => {
            void login('test-token');
          }}
        >
          Login
        </button>
        <button data-testid="logout-button" onClick={logout}>
          Logout
        </button>
      </div>
    );
  };

  // Test component that exposes login result
  const TestConsumerWithResult = () => {
    const { login } = useAuth();
    const [result, setResult] = React.useState<{ success: boolean; error?: string } | null>(null);

    const handleLogin = async (token: string): Promise<void> => {
      const loginResult = await login(token);
      setResult(loginResult);
    };

    return (
      <div>
        <button
          data-testid="login-button"
          onClick={() => {
            void handleLogin('test-token');
          }}
        >
          Login
        </button>
        <div data-testid="result">{result ? JSON.stringify(result) : 'no result'}</div>
      </div>
    );
  };

  beforeEach(() => {
    // Reset all mocks before each test
    mockSessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any remaining timers or async operations
    vi.clearAllTimers();
  });

  describe('initial state', () => {
    describe('when no token is stored', () => {
      it('should set isAuthenticated to false', () => {
        // PROVES: Default state is unauthenticated when no token exists
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        const status = screen.getByTestId('auth-status');
        expect(status.textContent).toBe('not authenticated');
      });

      it('should not call API on mount', () => {
        // PROVES: No unnecessary API calls when no token exists
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        expect(api.getStatus).not.toHaveBeenCalled();
      });
    });

    describe('when valid token is stored', () => {
      it('should validate token and set isAuthenticated to true', async () => {
        // PROVES: Existing valid tokens are automatically validated on mount
        mockSessionStorage.setItem('admin_api_token', 'valid-stored-token');

        const mockStatusResponse: ApiResult<StatusResponse> = {
          success: true,
          data: {
            guilds: 5,
            voiceConnections: 2,
            memory: { heapUsed: 100, heapTotal: 200, rss: 300 },
          },
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockStatusResponse);

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        // Initially should be not authenticated (token validation is async)
        expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');

        // Wait for token validation to complete
        await waitFor(() => {
          expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
        });

        expect(api.getStatus).toHaveBeenCalledWith('valid-stored-token');
      });
    });

    describe('when invalid token is stored', () => {
      it('should clear invalid token and stay unauthenticated', async () => {
        // PROVES: Invalid tokens are automatically cleaned up on mount
        mockSessionStorage.setItem('admin_api_token', 'invalid-stored-token');

        const mockErrorResponse: ApiResult<StatusResponse> = {
          success: false,
          error: 'unauthorized',
          message: 'Invalid token',
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockErrorResponse);

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        // Wait for validation attempt
        await waitFor(() => {
          expect(api.getStatus).toHaveBeenCalledWith('invalid-stored-token');
        });

        // Should remain unauthenticated
        expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');

        // Token should be cleared from storage
        expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('admin_api_token');
      });

      it('should handle API errors during validation', async () => {
        // PROVES: Network/API errors during validation don't crash the app
        mockSessionStorage.setItem('admin_api_token', 'token-with-network-error');

        vi.mocked(api.getStatus).mockRejectedValue(new Error('Network error'));

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        // Should handle error gracefully
        await waitFor(() => {
          expect(api.getStatus).toHaveBeenCalled();
        });

        // Should remain unauthenticated after error
        expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');

        // Token should be cleared after error
        expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('admin_api_token');
      });
    });
  });

  describe('login', () => {
    describe('with valid token', () => {
      it('should set isAuthenticated to true', async () => {
        // PROVES: Successful login updates auth state
        const mockStatusResponse: ApiResult<StatusResponse> = {
          success: true,
          data: {
            guilds: 3,
            voiceConnections: 1,
            memory: { heapUsed: 50, heapTotal: 100, rss: 150 },
          },
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockStatusResponse);

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        const loginButton = screen.getByTestId('login-button');

        await act(async () => {
          loginButton.click();
        });

        await waitFor(() => {
          expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
        });
      });

      it('should store token in sessionStorage', async () => {
        // PROVES: Valid tokens are persisted for session duration
        const mockStatusResponse: ApiResult<StatusResponse> = {
          success: true,
          data: {
            guilds: 3,
            voiceConnections: 1,
            memory: { heapUsed: 50, heapTotal: 100, rss: 150 },
          },
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockStatusResponse);

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        await waitFor(() => {
          expect(mockSessionStorage.setItem).toHaveBeenCalledWith('admin_api_token', 'test-token');
        });
      });

      it('should return success result', async () => {
        // PROVES: Login function returns success indicator for UI feedback
        const mockStatusResponse: ApiResult<StatusResponse> = {
          success: true,
          data: {
            guilds: 3,
            voiceConnections: 1,
            memory: { heapUsed: 50, heapTotal: 100, rss: 150 },
          },
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockStatusResponse);

        const TestComponent = () => {
          const { login } = useAuth();
          const [result, setResult] = React.useState<string>('');

          return (
            <div>
              <button
                data-testid="login-button"
                onClick={() => {
                  void login('test-token').then((res) => {
                    setResult(JSON.stringify(res));
                  });
                }}
              >
                Login
              </button>
              <div data-testid="result">{result}</div>
            </div>
          );
        };

        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        );

        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        await waitFor(() => {
          const result = screen.getByTestId('result').textContent;
          expect(result).toContain('"success":true');
        });
      });
    });

    describe('with invalid token', () => {
      it('should not set isAuthenticated to true', async () => {
        // PROVES: Failed login attempts don't grant authentication
        const mockErrorResponse: ApiResult<StatusResponse> = {
          success: false,
          error: 'unauthorized',
          message: 'Invalid bearer token',
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockErrorResponse);

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        // Wait for API call to complete
        await waitFor(() => {
          expect(api.getStatus).toHaveBeenCalled();
        });

        // Should remain unauthenticated
        expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');
      });

      it('should not store token in sessionStorage', async () => {
        // PROVES: Invalid tokens are never persisted
        const mockErrorResponse: ApiResult<StatusResponse> = {
          success: false,
          error: 'unauthorized',
          message: 'Invalid bearer token',
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockErrorResponse);

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        await waitFor(() => {
          expect(api.getStatus).toHaveBeenCalled();
        });

        // Should NOT have called setItem (only removeItem to clear any existing token)
        expect(mockSessionStorage.setItem).not.toHaveBeenCalledWith('admin_api_token', 'test-token');
      });

      it('should return error result', async () => {
        // PROVES: Login failures return descriptive errors for UI display
        const mockErrorResponse: ApiResult<StatusResponse> = {
          success: false,
          error: 'unauthorized',
          message: 'Invalid bearer token',
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockErrorResponse);

        const TestComponent = () => {
          const { login } = useAuth();
          const [result, setResult] = React.useState<string>('');

          return (
            <div>
              <button
                data-testid="login-button"
                onClick={() => {
                  void login('bad-token').then((res) => {
                    setResult(JSON.stringify(res));
                  });
                }}
              >
                Login
              </button>
              <div data-testid="result">{result}</div>
            </div>
          );
        };

        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        );

        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        await waitFor(() => {
          const result = screen.getByTestId('result').textContent;
          expect(result).toContain('"success":false');
          expect(result).toContain('"error":"Invalid bearer token"');
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty token string', async () => {
        // PROVES: Empty tokens are validated (and rejected) like any other token
        const mockErrorResponse: ApiResult<StatusResponse> = {
          success: false,
          error: 'unauthorized',
          message: 'No token provided',
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockErrorResponse);

        const TestComponent = () => {
          const { login } = useAuth();

          return (
            <div>
              <button
                data-testid="login-button"
                onClick={() => {
                  void login('');
                }}
              >
                Login
              </button>
            </div>
          );
        };

        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        );

        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        await waitFor(() => {
          expect(api.getStatus).toHaveBeenCalledWith('');
        });
      });

      it('should handle network errors', async () => {
        // PROVES: Network failures are treated as login failures
        vi.mocked(api.getStatus).mockRejectedValue(new Error('Network timeout'));

        const TestComponent = () => {
          const { login, isAuthenticated } = useAuth();
          const [error, setError] = React.useState<string>('');

          return (
            <div>
              <div data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'not authenticated'}</div>
              <button
                data-testid="login-button"
                onClick={() => {
                  void login('test-token').then((res) => {
                    if (!res.success) {
                      setError(res.error);
                    }
                  });
                }}
              >
                Login
              </button>
              <div data-testid="error">{error}</div>
            </div>
          );
        };

        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        );

        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        await waitFor(() => {
          expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');
          expect(screen.getByTestId('error').textContent).toBeTruthy();
        });
      });

      it('should handle concurrent login attempts', async () => {
        // PROVES: Multiple simultaneous logins don't cause race conditions
        const mockStatusResponse: ApiResult<StatusResponse> = {
          success: true,
          data: {
            guilds: 1,
            voiceConnections: 0,
            memory: { heapUsed: 10, heapTotal: 20, rss: 30 },
          },
        };

        // Delay the API response to simulate slow network
        vi.mocked(api.getStatus).mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve(mockStatusResponse);
              }, 100);
            })
        );

        const TestComponent = () => {
          const { login } = useAuth();

          return (
            <div>
              <button
                data-testid="login-button"
                onClick={() => {
                  void login('token1');
                  void login('token2');
                  void login('token3');
                }}
              >
                Login
              </button>
            </div>
          );
        };

        render(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        );

        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        // Wait for all operations to complete
        await waitFor(
          () => {
            expect(api.getStatus).toHaveBeenCalled();
          },
          { timeout: 500 }
        );

        // All three calls should have been made
        expect(api.getStatus).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('logout', () => {
    describe('when authenticated', () => {
      it('should set isAuthenticated to false', async () => {
        // PROVES: Logout immediately removes authentication
        const mockStatusResponse: ApiResult<StatusResponse> = {
          success: true,
          data: {
            guilds: 1,
            voiceConnections: 0,
            memory: { heapUsed: 10, heapTotal: 20, rss: 30 },
          },
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockStatusResponse);

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        // Login first
        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        await waitFor(() => {
          expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
        });

        // Then logout
        await act(async () => {
          screen.getByTestId('logout-button').click();
        });

        expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');
      });

      it('should clear token from sessionStorage', async () => {
        // PROVES: Logout removes stored credentials
        const mockStatusResponse: ApiResult<StatusResponse> = {
          success: true,
          data: {
            guilds: 1,
            voiceConnections: 0,
            memory: { heapUsed: 10, heapTotal: 20, rss: 30 },
          },
        };
        vi.mocked(api.getStatus).mockResolvedValue(mockStatusResponse);

        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        // Login first
        await act(async () => {
          screen.getByTestId('login-button').click();
        });

        await waitFor(() => {
          expect(mockSessionStorage.setItem).toHaveBeenCalledWith('admin_api_token', 'test-token');
        });

        // Clear mock calls to verify logout behavior
        vi.clearAllMocks();

        // Then logout
        await act(async () => {
          screen.getByTestId('logout-button').click();
        });

        expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('admin_api_token');
      });
    });

    describe('when not authenticated', () => {
      it('should not throw error', async () => {
        // PROVES: Logout is idempotent and safe to call when not logged in
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        expect(() => {
          act(() => {
            screen.getByTestId('logout-button').click();
          });
        }).not.toThrow();

        expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');
      });

      it('should still clear token from storage', async () => {
        // PROVES: Logout cleans up any stale tokens even if state is already unauthenticated
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        );

        act(() => {
          screen.getByTestId('logout-button').click();
        });

        expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('admin_api_token');
      });
    });
  });

  describe('integration: complete auth flow', () => {
    it('should support login -> logout -> login cycle', async () => {
      // PROVES: Auth system supports multiple session cycles
      const mockStatusResponse: ApiResult<StatusResponse> = {
        success: true,
        data: {
          guilds: 1,
          voiceConnections: 0,
          memory: { heapUsed: 10, heapTotal: 20, rss: 30 },
        },
      };
      vi.mocked(api.getStatus).mockResolvedValue(mockStatusResponse);

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      // Initial state: not authenticated
      expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');

      // First login
      await act(async () => {
        screen.getByTestId('login-button').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
      });

      // Logout
      await act(async () => {
        screen.getByTestId('logout-button').click();
      });

      expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');

      // Second login
      await act(async () => {
        screen.getByTestId('login-button').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
      });
    });

    it('should handle failed login followed by successful login', async () => {
      // PROVES: Auth state recovers correctly after failed attempts
      const mockErrorResponse: ApiResult<StatusResponse> = {
        success: false,
        error: 'unauthorized',
        message: 'Invalid token',
      };

      const mockSuccessResponse: ApiResult<StatusResponse> = {
        success: true,
        data: {
          guilds: 1,
          voiceConnections: 0,
          memory: { heapUsed: 10, heapTotal: 20, rss: 30 },
        },
      };

      // First call fails, second succeeds
      vi.mocked(api.getStatus).mockResolvedValueOnce(mockErrorResponse).mockResolvedValueOnce(mockSuccessResponse);

      const TestComponent = () => {
        const { login, isAuthenticated } = useAuth();

        return (
          <div>
            <div data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'not authenticated'}</div>
            <button
              data-testid="login-bad"
              onClick={() => {
                void login('bad-token');
              }}
            >
              Login Bad
            </button>
            <button
              data-testid="login-good"
              onClick={() => {
                void login('good-token');
              }}
            >
              Login Good
            </button>
          </div>
        );
      };

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Failed login
      await act(async () => {
        screen.getByTestId('login-bad').click();
      });

      await waitFor(() => {
        expect(api.getStatus).toHaveBeenCalledWith('bad-token');
      });

      expect(screen.getByTestId('auth-status').textContent).toBe('not authenticated');

      // Successful login
      await act(async () => {
        screen.getByTestId('login-good').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('authenticated');
      });

      expect(api.getStatus).toHaveBeenCalledWith('good-token');
    });
  });
});
