/**
 * LoginPage Component Tests
 *
 * Tests for src/pages/LoginPage.tsx
 * Verifies rendering, form submission, and bot status display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { LoginPage } from '../pages/LoginPage';
import * as apiClient from '../api/client';
import type { AuthContextValue } from '../auth/AuthContext';
import { AuthContext } from '../auth/AuthContext';
import type { ReactNode } from 'react';

// Mock the API client
vi.mock('../api/client', () => ({
  getHealth: vi.fn(),
}));

describe('LoginPage', () => {
  const mockLogin = vi.fn();
  const mockLogout = vi.fn();

  const mockAuthContext: AuthContextValue = {
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
    logout: mockLogout,
  };

  // Helper to render LoginPage with AuthContext
  // Note: The LoginPage component calls an async getHealth() in useEffect.
  // We wrap render in act() to properly handle the async state updates.
  const renderLoginPage = () => {
    let renderResult: ReturnType<typeof render>;
    act(() => {
      renderResult = render(
        <AuthContext.Provider value={mockAuthContext}>
          <LoginPage />
        </AuthContext.Provider>
      );
    });
    return renderResult!;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the login form', async () => {
    vi.mocked(apiClient.getHealth).mockResolvedValue({
      success: true,
      data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
    });

    renderLoginPage();

    // Wait for health check to complete
    await waitFor(() => {
      expect(apiClient.getHealth).toHaveBeenCalled();
    });

    expect(screen.getByText('ShawnBot Admin')).toBeInTheDocument();
    expect(screen.getByText('Enter your token to continue')).toBeInTheDocument();
    expect(screen.getByLabelText('Access Token')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('should display bot online status when health check succeeds', async () => {
    vi.mocked(apiClient.getHealth).mockResolvedValue({
      success: true,
      data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
    });

    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByText('Bot Online')).toBeInTheDocument();
    });
  });

  it('should display bot offline status when health check fails', async () => {
    vi.mocked(apiClient.getHealth).mockResolvedValue({
      success: false,
      error: 'NETWORK_ERROR',
      message: 'Connection failed',
    });

    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByText('Bot Offline')).toBeInTheDocument();
    });
  });

  it('should display loading state initially', async () => {
    vi.mocked(apiClient.getHealth).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    await act(async () => {
      renderLoginPage();
    });

    expect(screen.getByText('Checking bot status...')).toBeInTheDocument();
  });

  it('should have footer text about admin interface', async () => {
    vi.mocked(apiClient.getHealth).mockResolvedValue({
      success: true,
      data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
    });

    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByText('This is an authenticated admin interface.')).toBeInTheDocument();
      expect(screen.getByText('Contact your administrator for access credentials.')).toBeInTheDocument();
    });
  });

  it('should call getHealth on mount', async () => {
    vi.mocked(apiClient.getHealth).mockResolvedValue({
      success: true,
      data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
    });

    renderLoginPage();

    await waitFor(() => {
      expect(apiClient.getHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('Form Interaction and Submission', () => {
    it('should call login() when form is submitted', async () => {
      // BEHAVIOR: Submitting the form must call the login function from AuthContext
      // WHY: This is the core authentication action

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      mockLogin.mockResolvedValue({ success: true });

      renderLoginPage();

      const tokenInput = screen.getByLabelText('Access Token') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /login/i });

      // Type a token
      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: 'test-token-123' } });

        // Submit the form
        fireEvent.click(submitButton);
      });

      // login() should be called with the token
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test-token-123');
      });
    });

    it('should disable submit button while submitting', async () => {
      // BEHAVIOR: Submit button must be disabled during authentication to prevent double-submission
      // WHY: Prevents multiple concurrent login attempts

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      // Mock login to stay pending (never resolve)
      mockLogin.mockImplementation(() => new Promise(() => {}));

      renderLoginPage();

      const tokenInput = screen.getByLabelText('Access Token') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /^login$/i });

      // Type a token and submit
      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: 'test-token' } });

        // Submit the form
        fireEvent.click(submitButton);
      });

      // Button should show loading state and be disabled
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
        expect(submitButton).toHaveTextContent(/logging in/i);
      });
    });

    it('should disable token input during submission', async () => {
      // BEHAVIOR: Token input should be disabled while authentication is in progress
      // WHY: Prevents user from modifying input during API call

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      mockLogin.mockImplementation(() => new Promise(() => {}));

      renderLoginPage();

      const tokenInput = screen.getByLabelText('Access Token') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /^login$/i });

      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: 'test-token' } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(tokenInput).toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when login fails', async () => {
      // BEHAVIOR: Failed login attempts must display the error message to the user
      // WHY: Users need feedback when authentication fails

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      mockLogin.mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      renderLoginPage();

      const tokenInput = screen.getByLabelText('Access Token') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /^login$/i });

      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: 'wrong-token' } });
        fireEvent.click(submitButton);
      });

      // Error should be displayed
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });

    it('should clear error message when user starts typing', async () => {
      // BEHAVIOR: Error messages must clear when user modifies the token input
      // WHY: Stale error messages are confusing; clearing provides fresh feedback

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      mockLogin.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      renderLoginPage();

      const tokenInput = screen.getByLabelText('Access Token') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /^login$/i });

      // Submit with wrong token to trigger error
      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: 'wrong' } });
        fireEvent.click(submitButton);
      });

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(/invalid token/i)).toBeInTheDocument();
      });

      // Start typing - error should be cleared
      // Looking at the LoginPage implementation: onChange={(e) => setToken(e.target.value)}
      // The setToken is called but the error clearing happens in handleSubmit (setError(''))
      // Actually, the implementation doesn't clear error on typing. This is a gap!
      // But we're testing what SHOULD happen according to the requirements.
      // Let me check the actual implementation again...

      // Based on the implementation, error is cleared in handleSubmit via setError('')
      // But NOT on onChange. This test will FAIL, which is correct - it reveals a bug.
      // However, let me check if there's error clearing logic...

      // The implementation shows: onChange={(e) => setToken(e.target.value)}
      // No error clearing. Let's test what actually happens (the test should fail if implementation is wrong)

      fireEvent.change(tokenInput, { target: { value: 'new-token' } });

      // According to requirements, error should clear. But implementation may not do this.
      // This test documents the INTENDED behavior.
      await waitFor(() => {
        // This will fail if implementation doesn't clear error on typing
        // But that's the point - the test proves the requirement isn't met
        expect(screen.queryByText(/invalid token/i)).not.toBeInTheDocument();
      });
    });

    it('should display default error message when login returns no error field', async () => {
      // BEHAVIOR: When login fails without a specific error message, show default
      // WHY: Always provide user feedback, even for unexpected error formats

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      mockLogin.mockResolvedValue({
        success: false,
        // No error field
      });

      renderLoginPage();

      const tokenInput = screen.getByLabelText('Access Token') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /^login$/i });

      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: 'test' } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        // Should show default error message
        expect(
          screen.getByText(/invalid token\. please check your credentials and try again\./i),
        ).toBeInTheDocument();
      });
    });

    it('should handle unexpected errors during login', async () => {
      // BEHAVIOR: Exceptions thrown during login must be caught and displayed
      // WHY: Prevents app crashes and provides user-friendly error messages

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      // Mock login to throw an exception
      mockLogin.mockRejectedValue(new Error('Network failure'));

      renderLoginPage();

      const tokenInput = screen.getByLabelText('Access Token') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /^login$/i });

      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: 'test' } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/an unexpected error occurred\. please try again\./i),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Bot Status Edge Cases', () => {
    it('should show offline when health check succeeds but bot is not ready', async () => {
      // BEHAVIOR: Bot status should be offline when ready=false
      // WHY: Bot is up but not ready to handle requests

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: {
          status: 'ok',
          uptime: 10,
          ready: false, // Not ready yet
          guilds: 0,
        },
      });

      renderLoginPage();

      await waitFor(() => {
        expect(screen.getByText('Bot Offline')).toBeInTheDocument();
      });
    });

    it('should only check health once on mount', async () => {
      // BEHAVIOR: Health check should only run once when component mounts
      // WHY: Prevents unnecessary API calls

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      const { rerender } = renderLoginPage();

      await waitFor(() => {
        expect(apiClient.getHealth).toHaveBeenCalledTimes(1);
      });

      // Force re-render
      rerender(
        <AuthContext.Provider value={mockAuthContext}>
          <LoginPage />
        </AuthContext.Provider>
      );

      // Should still only be called once
      expect(apiClient.getHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('Validation', () => {
    it('should disable submit button when token is empty', async () => {
      // BEHAVIOR: Submit button should be disabled when token field is empty
      // WHY: Prevents form submission with no credentials

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      renderLoginPage();

      // Wait for health check to complete
      await waitFor(() => {
        expect(apiClient.getHealth).toHaveBeenCalled();
      });

      const submitButton = screen.getByRole('button', { name: /^login$/i });

      // Button should be disabled when token is empty
      expect(submitButton).toBeDisabled();
    });

    it('should disable submit button when token is only whitespace', async () => {
      // BEHAVIOR: Whitespace-only tokens should keep submit button disabled
      // WHY: token.trim() would be empty, invalid for authentication

      vi.mocked(apiClient.getHealth).mockResolvedValue({
        success: true,
        data: { status: 'ok', uptime: 100, ready: true, guilds: 5 },
      });

      renderLoginPage();

      // Wait for health check to complete
      await waitFor(() => {
        expect(apiClient.getHealth).toHaveBeenCalled();
      });

      const tokenInput = screen.getByLabelText('Access Token') as HTMLInputElement;
      const submitButton = screen.getByRole('button', { name: /^login$/i });

      // Type only whitespace
      await act(async () => {
        fireEvent.change(tokenInput, { target: { value: '    ' } });
      });

      // Button should still be disabled
      expect(submitButton).toBeDisabled();
    });
  });
});
