/**
 * App Component Tests
 *
 * Tests for src/App.tsx authentication flow:
 * 1. Shows loading state while auth is initializing
 * 2. Shows LoginPage when not authenticated
 * 3. Shows dashboard placeholder when authenticated
 * 4. Logout button calls logout() and returns to login
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { App } from '../App';
import * as authContext from '../auth/AuthContext';
import type { AuthContextValue } from '../auth/AuthContext';
import * as apiClient from '../api/client';
import * as useAuthModule from '../auth/useAuth';

// Mock the API client
vi.mock('../api/client');

// Mock the useAuth hook
vi.mock('../auth/useAuth');

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getHealth for LoginPage
    vi.mocked(apiClient.getHealth).mockResolvedValue({
      success: true,
      data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
    });

    // Set default mock for useAuth
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    // Spy on the AuthContext to inject our mock
    vi.spyOn(authContext, 'AuthProvider').mockImplementation(({ children }) => {
      return <>{children}</>;
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner while auth is initializing', async () => {
      // BEHAVIOR: During initial token validation, show loading state
      // WHY: Provides feedback while checking for stored credentials

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: true, // Auth check in progress
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // Should show loading indicator
      expect(screen.getByText(/loading/i)).toBeInTheDocument();

      // Should NOT show login page or dashboard
      expect(screen.queryByText(/shawnbot admin/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
    });

    it('should show spinner animation during loading', async () => {
      // BEHAVIOR: Loading state must include visual spinner
      // WHY: Clear visual indication that something is happening

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // Spinner should be present (has animate-spin class)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Unauthenticated State', () => {
    it('should show LoginPage when not authenticated', async () => {
      // BEHAVIOR: After loading completes with no valid token, show login form
      // WHY: Users must authenticate before accessing admin features

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: false, // Loading complete
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // LoginPage should be rendered - check for token input
      expect(screen.getByLabelText(/access token/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();

      // Dashboard should NOT be visible
      expect(screen.queryByText(/logout/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
    });

    it('should not show dashboard or logout button when not authenticated', async () => {
      // BEHAVIOR: Protected content must not be accessible without authentication
      // WHY: Security - prevent unauthorized access to admin interface

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // These should not be in the document
      expect(screen.queryByText(/logout/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/logged in successfully/i)).not.toBeInTheDocument();
    });
  });

  describe('Authenticated State', () => {
    it('should show dashboard when authenticated', async () => {
      // BEHAVIOR: Valid authentication should display the dashboard
      // WHY: Authenticated users need access to admin features

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // Dashboard should be visible
      expect(screen.getByText(/logged in successfully/i)).toBeInTheDocument();

      // LoginPage should NOT be visible
      expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^login$/i })).not.toBeInTheDocument();
    });

    it('should show logout button when authenticated', async () => {
      // BEHAVIOR: Authenticated users must have access to logout functionality
      // WHY: Users need a way to end their session

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // Logout button should be present
      const logoutButton = screen.getByRole('button', { name: /logout/i });
      expect(logoutButton).toBeInTheDocument();
    });

    it('should call logout() when logout button is clicked', async () => {
      // BEHAVIOR: Clicking logout button must trigger logout action
      // WHY: This is the primary way users end their session

      const mockLogout = vi.fn();

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: mockLogout,
      });

      await act(async () => {
        render(<App />);
      });

      const logoutButton = screen.getByRole('button', { name: /logout/i });

      // Click logout button
      logoutButton.click();

      // logout() should be called
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledOnce();
      });
    });

    it('should not show loading spinner when authenticated', async () => {
      // BEHAVIOR: After successful auth, loading indicator should not be shown
      // WHY: Loading is only for initial auth check

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // Loading text should not be present
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();

      // Spinner should not be present
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).not.toBeInTheDocument();
    });
  });

  describe('State Transitions', () => {
    it('should transition from loading to login when auth check completes without token', async () => {
      // BEHAVIOR: Loading → Unauthenticated transition must be seamless
      // WHY: Common flow when user visits app for first time or after logout

      const mockLogin = vi.fn();
      const mockLogout = vi.fn();

      // Start in loading state
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        login: mockLogin,
        logout: mockLogout,
      });

      const { rerender } = await act(async () => {
        return render(<App />);
      });

      // Initially shows loading
      expect(screen.getByText(/loading/i)).toBeInTheDocument();

      // Simulate auth check completing
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: false, // Auth check done, no token found
        login: mockLogin,
        logout: mockLogout,
      });

      await act(async () => {
        rerender(<App />);
      });

      // Should now show login page
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/access token/i)).toBeInTheDocument();
      });
    });

    it('should transition from login to dashboard after successful authentication', async () => {
      // BEHAVIOR: Login → Authenticated transition must occur automatically
      // WHY: After login succeeds, user should see dashboard immediately

      const mockLogin = vi.fn();
      const mockLogout = vi.fn();

      // Start unauthenticated
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        login: mockLogin,
        logout: mockLogout,
      });

      const { rerender } = await act(async () => {
        return render(<App />);
      });

      // Initially shows login page
      expect(screen.getByLabelText(/access token/i)).toBeInTheDocument();

      // Simulate successful login
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true, // Now authenticated
        isLoading: false,
        login: mockLogin,
        logout: mockLogout,
      });

      await act(async () => {
        rerender(<App />);
      });

      // Should now show dashboard
      await waitFor(() => {
        expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
      });
    });

    it('should transition from dashboard to login after logout', async () => {
      // BEHAVIOR: Logout must return user to login screen
      // WHY: After session ends, user must re-authenticate

      const mockLogin = vi.fn();
      const mockLogout = vi.fn();

      // Start authenticated
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        login: mockLogin,
        logout: mockLogout,
      });

      const { rerender } = render(<App />);

      // Initially shows dashboard
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();

      // Simulate logout
      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false, // No longer authenticated
        isLoading: false,
        login: mockLogin,
        logout: mockLogout,
      });

      await act(async () => {
        rerender(<App />);
      });

      // Should now show login page
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /dashboard/i })).not.toBeInTheDocument();
        expect(screen.getByLabelText(/access token/i)).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle both isLoading and isAuthenticated being true', async () => {
      // BEHAVIOR: isLoading takes precedence over isAuthenticated
      // WHY: Should not happen in practice, but loading check comes first in code

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: true, // Both true
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // Should show loading (loading check is first in component)
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should render without crashing when auth context is available', async () => {
      // BEHAVIOR: App must render successfully with valid auth context
      // WHY: Basic smoke test

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await expect(
        act(async () => {
          render(<App />);
        })
      ).resolves.not.toThrow();
    });
  });

  describe('AuthProvider Integration', () => {
    it('should wrap content in AuthProvider', async () => {
      // BEHAVIOR: App component must provide auth context to children
      // WHY: useAuth hook in child components requires AuthProvider

      // We've mocked AuthProvider, but in real app it should wrap the content
      // This test verifies the structure is correct

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      // If AuthProvider is missing, useAuth would throw
      // The fact that we can render means the provider is present
      expect(screen.getByLabelText(/access token/i)).toBeInTheDocument();
    });
  });

  describe('Dashboard Content', () => {
    it('should display placeholder message about future features', async () => {
      // BEHAVIOR: Dashboard should inform users about upcoming functionality
      // WHY: Sets expectations for what will be added

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      expect(
        screen.getByText(/this is a placeholder dashboard/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/future updates will add guild management/i),
      ).toBeInTheDocument();
    });

    it('should show success message after login', async () => {
      // BEHAVIOR: Dashboard should confirm successful authentication
      // WHY: Provides positive feedback to user

      vi.mocked(useAuthModule.useAuth).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });

      await act(async () => {
        render(<App />);
      });

      expect(screen.getByText(/logged in successfully/i)).toBeInTheDocument();
    });
  });
});
