/**
 * DashboardPage Component Tests
 *
 * Tests for src/pages/DashboardPage.tsx
 * Verifies rendering, data fetching, guild management, and error handling
 *
 * BEHAVIOR VERIFICATION:
 * This test suite proves the DashboardPage component:
 * 1. Correctly fetches and displays bot status
 * 2. Fetches and renders guild list in a table
 * 3. Handles enable/disable toggle operations
 * 4. Shows appropriate loading, empty, and error states
 * 5. Provides refresh and logout functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { DashboardPage } from '../pages/DashboardPage';
import * as apiClient from '../api/client';
import * as tokenStorage from '../auth/tokenStorage';
import type { AuthContextValue } from '../auth/AuthContext';
import { AuthContext } from '../auth/AuthContext';
import type {
  StatusResponse,
  GuildsListResponse,
  OperationResponse,
  GuildSummary,
} from '../api/types';

// Mock the API client
vi.mock('../api/client', () => ({
  getStatus: vi.fn(),
  getGuilds: vi.fn(),
  enableGuild: vi.fn(),
  disableGuild: vi.fn(),
}));

// Mock tokenStorage
vi.mock('../auth/tokenStorage', () => ({
  getToken: vi.fn(),
}));

describe('DashboardPage', () => {
  const mockLogout = vi.fn();

  const mockAuthContext: AuthContextValue = {
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: mockLogout,
  };

  // Test data
  const mockToken = 'test-token-123';

  const mockStatus: StatusResponse = {
    guilds: 5,
    voiceConnections: 2,
    memory: {
      heapUsed: 52428800, // 50 MB
      heapTotal: 104857600, // 100 MB
      rss: 157286400, // 150 MB
    },
  };

  const mockGuilds: GuildSummary[] = [
    {
      guildId: '123456789012345678',
      name: 'Test Server',
      enabled: true,
      connected: false,
    },
    {
      guildId: '987654321098765432',
      name: 'Another Server',
      enabled: false,
      connected: true,
    },
  ];

  const mockGuildsResponse: GuildsListResponse = {
    guilds: mockGuilds,
  };

  // Helper to render DashboardPage with AuthContext
  const renderDashboard = () => {
    return render(
      <AuthContext.Provider value={mockAuthContext}>
        <DashboardPage />
      </AuthContext.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tokenStorage.getToken).mockReturnValue(mockToken);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Rendering and Data Fetching', () => {
    it('should show loading spinner on initial load', async () => {
      // BEHAVIOR: Before data is fetched, must display loading state
      // WHY: Prevents jarring empty state, provides user feedback during async operations

      // Make API calls never resolve to keep component in loading state
      vi.mocked(apiClient.getStatus).mockImplementation(
        () => new Promise(() => {})
      );
      vi.mocked(apiClient.getGuilds).mockImplementation(
        () => new Promise(() => {})
      );

      await act(async () => {
        renderDashboard();
      });

      // Should show loading spinner
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should fetch bot status on mount', async () => {
      // BEHAVIOR: Component must call getStatus() on mount with stored token
      // WHY: Bot status is required to display current system state

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(apiClient.getStatus).toHaveBeenCalledTimes(1);
        expect(apiClient.getStatus).toHaveBeenCalledWith(mockToken);
      });
    });

    it('should fetch guild list on mount', async () => {
      // BEHAVIOR: Component must call getGuilds() on mount with stored token
      // WHY: Guild list is the primary content of the dashboard

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(apiClient.getGuilds).toHaveBeenCalledTimes(1);
        expect(apiClient.getGuilds).toHaveBeenCalledWith(mockToken);
      });
    });

    it('should fetch both status and guilds in parallel', async () => {
      // BEHAVIOR: Both API calls should be initiated concurrently
      // WHY: Reduces total load time by parallelizing independent requests

      const statusDelay = 100;
      const guildsDelay = 150;

      vi.mocked(apiClient.getStatus).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, data: mockStatus }),
              statusDelay
            )
          )
      );
      vi.mocked(apiClient.getGuilds).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, data: mockGuildsResponse }),
              guildsDelay
            )
          )
      );

      const startTime = Date.now();

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // If called in parallel, total time should be ~max(100, 150) = 150ms
      // If called sequentially, total time would be 100 + 150 = 250ms
      // Allow some overhead, but verify it's closer to parallel timing
      expect(duration).toBeLessThan(statusDelay + guildsDelay);
    });
  });

  describe('Bot Status Display', () => {
    it('should display bot status after successful fetch', async () => {
      // BEHAVIOR: After successful status fetch, display guilds, connections, and memory
      // WHY: Provides system health overview to admin

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument(); // guilds count
        expect(screen.getByText('2')).toBeInTheDocument(); // voice connections
      });
    });

    it('should format memory usage as MB', async () => {
      // BEHAVIOR: Memory values must be converted from bytes to MB with proper formatting
      // WHY: Raw byte values are not human-readable

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        // 52428800 bytes = 50 MB
        expect(screen.getByText(/50.*MB/i)).toBeInTheDocument();
      });
    });

    it('should display memory with appropriate precision', async () => {
      // BEHAVIOR: Memory values should be formatted to reasonable precision (e.g., 1 decimal)
      // WHY: Excessive precision is noise; appropriate precision aids readability

      const statusWithOddMemory: StatusResponse = {
        guilds: 3,
        voiceConnections: 1,
        memory: {
          heapUsed: 52428851, // 50.0 MB
          heapTotal: 104857600,
          rss: 157286400,
        },
      };

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: statusWithOddMemory,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        // Should show "50.0 MB" not "50.00004863739427 MB"
        const text = screen.getByText(/50\.0.*MB/i);
        expect(text).toBeInTheDocument();
        // Verify it doesn't show excessive decimal places
        expect(screen.queryByText(/50\.00004/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Guild List Display', () => {
    it('should display guild list in table format', async () => {
      // BEHAVIOR: Guilds must be rendered in a table with columns for name, ID, status, and actions
      // WHY: Tabular format best presents structured guild data

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Test Server')).toBeInTheDocument();
        expect(screen.getByText('Another Server')).toBeInTheDocument();
        expect(screen.getByText('123456789012345678')).toBeInTheDocument();
        expect(screen.getByText('987654321098765432')).toBeInTheDocument();
      });
    });

    it('should show enable/disable toggles for each guild', async () => {
      // BEHAVIOR: Each guild row must have an interactive toggle for enable/disable
      // WHY: Primary action for managing AFK detection per guild

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        // Should have 2 toggle buttons (one per guild)
        const toggles = screen.getAllByRole('switch');
        expect(toggles).toHaveLength(2);
      });
    });

    it('should show connected status indicators', async () => {
      // BEHAVIOR: Each guild must display whether bot is voice-connected
      // WHY: Admins need to know voice connection state for troubleshooting

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        // First guild: connected: false -> "Not Connected"
        // Second guild: connected: true -> "Connected"
        expect(screen.getByText('Connected')).toBeInTheDocument();
        expect(screen.getByText('Not Connected')).toBeInTheDocument();
      });
    });

    it('should reflect correct initial toggle state based on enabled field', async () => {
      // BEHAVIOR: Toggle switches must accurately reflect guild.enabled state
      // WHY: UI state must match actual configuration

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        const toggles = screen.getAllByRole('switch');
        // First guild enabled: true
        expect(toggles[0]).toBeChecked();
        // Second guild enabled: false
        expect(toggles[1]).not.toBeChecked();
      });
    });
  });

  describe('Empty States', () => {
    it('should show empty state when no guilds exist', async () => {
      // BEHAVIOR: When guilds array is empty, display appropriate empty state message
      // WHY: Prevents confusing blank table, guides user on what's expected

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: { ...mockStatus, guilds: 0 },
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: { guilds: [] },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/no guilds found/i)).toBeInTheDocument();
      });
    });

    it('should not show table headers when no guilds exist', async () => {
      // BEHAVIOR: Empty state should not render table structure
      // WHY: Table headers without rows look broken; empty state is cleaner

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: { ...mockStatus, guilds: 0 },
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: { guilds: [] },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error state on status fetch failure', async () => {
      // BEHAVIOR: When getStatus fails, display error message
      // WHY: Users need feedback when data loading fails

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Failed to connect to API',
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/failed to connect to API/i)).toBeInTheDocument();
      });
    });

    it('should show error state on guilds fetch failure', async () => {
      // BEHAVIOR: When getGuilds fails with non-UNAUTHORIZED error, display error message
      // WHY: Users need feedback when guild list fails to load

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Failed to fetch guilds list',
      });

      renderDashboard();

      await waitFor(() => {
        expect(
          screen.getByText(/failed to fetch guilds list/i)
        ).toBeInTheDocument();
      });
    });

    it('should show retry button on fetch failure', async () => {
      // BEHAVIOR: Error state must include a retry button
      // WHY: Allows user to recover from transient failures without page reload

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Network error',
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('should refetch data when retry button is clicked', async () => {
      // BEHAVIOR: Clicking retry must re-initiate both API calls
      // WHY: Provides recovery mechanism from errors

      // First call fails
      vi.mocked(apiClient.getStatus).mockResolvedValueOnce({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Network error',
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Mock successful retry
      vi.mocked(apiClient.getStatus).mockResolvedValueOnce({
        success: true,
        data: mockStatus,
      });

      const retryButton = screen.getByRole('button', { name: /retry/i });

      await act(async () => {
        fireEvent.click(retryButton);
      });

      // Should have called getStatus twice (initial + retry)
      await waitFor(() => {
        expect(apiClient.getStatus).toHaveBeenCalledTimes(2);
      });
    });

    it('should auto-logout on UNAUTHORIZED error from status endpoint', async () => {
      // BEHAVIOR: UNAUTHORIZED (401) errors should trigger auto-logout
      // WHY: Invalid token should immediately end session

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid token - authentication failed',
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      // Should have called logout automatically on UNAUTHORIZED
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should show refresh button', async () => {
      // BEHAVIOR: Dashboard must provide a refresh button for manual data reload
      // WHY: Allows admins to get latest state without page reload

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
      });
    });

    it('should refetch data when refresh button is clicked', async () => {
      // BEHAVIOR: Clicking refresh must re-call both getStatus and getGuilds
      // WHY: Updates dashboard with latest data

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      // Wait for initial load
      await waitFor(() => {
        expect(apiClient.getStatus).toHaveBeenCalledTimes(1);
        expect(apiClient.getGuilds).toHaveBeenCalledTimes(1);
      });

      const refreshButton = screen.getByRole('button', { name: /refresh/i });

      await act(async () => {
        fireEvent.click(refreshButton);
      });

      // Should have called both APIs twice (initial + refresh)
      await waitFor(() => {
        expect(apiClient.getStatus).toHaveBeenCalledTimes(2);
        expect(apiClient.getGuilds).toHaveBeenCalledTimes(2);
      });
    });

    it('should update displayed data after refresh', async () => {
      // BEHAVIOR: Refresh must update UI with new data from API
      // WHY: Proves that refresh actually updates state, not just makes API calls

      const updatedStatus: StatusResponse = {
        guilds: 10,
        voiceConnections: 5,
        memory: {
          heapUsed: 104857600, // 100 MB
          heapTotal: 209715200,
          rss: 314572800,
        },
      };

      // Initial data
      vi.mocked(apiClient.getStatus).mockResolvedValueOnce({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      // Wait for initial data
      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument(); // original guild count
      });

      // Mock updated data for refresh
      vi.mocked(apiClient.getStatus).mockResolvedValueOnce({
        success: true,
        data: updatedStatus,
      });

      const refreshButton = screen.getByRole('button', { name: /refresh/i });

      await act(async () => {
        fireEvent.click(refreshButton);
      });

      // Should show updated guild count
      await waitFor(() => {
        expect(screen.getByText('10')).toBeInTheDocument();
      });
    });

    it('should disable refresh button while loading', async () => {
      // BEHAVIOR: Refresh button must be disabled during data fetch
      // WHY: Prevents multiple concurrent refresh operations

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Make next fetch hang
      vi.mocked(apiClient.getStatus).mockImplementation(
        () => new Promise(() => {})
      );

      const refreshButton = screen.getByRole('button', { name: /refresh/i });

      await act(async () => {
        fireEvent.click(refreshButton);
      });

      // Button should be disabled while loading
      await waitFor(() => {
        expect(refreshButton).toBeDisabled();
      });
    });
  });

  describe('Logout Functionality', () => {
    it('should show logout button', async () => {
      // BEHAVIOR: Dashboard must provide logout button
      // WHY: Users need ability to end authenticated session

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
      });
    });

    it('should call logout function when logout button is clicked', async () => {
      // BEHAVIOR: Clicking logout must call the logout function from AuthContext
      // WHY: Terminates session and clears stored token

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      // Wait for load to complete
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const logoutButton = screen.getByRole('button', { name: /logout/i });

      await act(async () => {
        fireEvent.click(logoutButton);
      });

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('Toggle Guild Enable/Disable', () => {
    it('should call enableGuild API when toggle is switched from disabled to enabled', async () => {
      // BEHAVIOR: Clicking toggle on disabled guild must call enableGuild API
      // WHY: Activates AFK detection for that guild

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      const enableResponse: OperationResponse = {
        success: true,
        guildId: '987654321098765432',
        enabled: true,
      };

      vi.mocked(apiClient.enableGuild).mockResolvedValue({
        success: true,
        data: enableResponse,
      });

      renderDashboard();

      // Wait for guilds to load
      await waitFor(() => {
        expect(screen.getByText('Another Server')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      const disabledToggle = toggles[1]!; // Second guild is disabled

      await act(async () => {
        fireEvent.click(disabledToggle);
      });

      await waitFor(() => {
        expect(apiClient.enableGuild).toHaveBeenCalledWith(
          mockToken,
          '987654321098765432'
        );
      });
    });

    it('should call disableGuild API when toggle is switched from enabled to disabled', async () => {
      // BEHAVIOR: Clicking toggle on enabled guild must call disableGuild API
      // WHY: Deactivates AFK detection for that guild

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      const disableResponse: OperationResponse = {
        success: true,
        guildId: '123456789012345678',
        enabled: false,
      };

      vi.mocked(apiClient.disableGuild).mockResolvedValue({
        success: true,
        data: disableResponse,
      });

      renderDashboard();

      // Wait for guilds to load
      await waitFor(() => {
        expect(screen.getByText('Test Server')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      const enabledToggle = toggles[0]!; // First guild is enabled

      await act(async () => {
        fireEvent.click(enabledToggle);
      });

      await waitFor(() => {
        expect(apiClient.disableGuild).toHaveBeenCalledWith(
          mockToken,
          '123456789012345678'
        );
      });
    });

    it('should update guild state in list after successful enable', async () => {
      // BEHAVIOR: After enable succeeds, guild's enabled state must update in UI
      // WHY: UI must reflect new state without requiring manual refresh

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      const enableResponse: OperationResponse = {
        success: true,
        guildId: '987654321098765432',
        enabled: true,
      };

      vi.mocked(apiClient.enableGuild).mockResolvedValue({
        success: true,
        data: enableResponse,
      });

      renderDashboard();

      // Wait for guilds to load
      await waitFor(() => {
        expect(screen.getByText('Another Server')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      const disabledToggle = toggles[1]!; // Second guild starts disabled

      // Verify initial state
      expect(disabledToggle).not.toBeChecked();

      await act(async () => {
        fireEvent.click(disabledToggle);
      });

      // After successful enable, toggle should be checked
      await waitFor(() => {
        expect(disabledToggle).toBeChecked();
      });
    });

    it('should update guild state in list after successful disable', async () => {
      // BEHAVIOR: After disable succeeds, guild's enabled state must update in UI
      // WHY: UI must reflect new state without requiring manual refresh

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      const disableResponse: OperationResponse = {
        success: true,
        guildId: '123456789012345678',
        enabled: false,
      };

      vi.mocked(apiClient.disableGuild).mockResolvedValue({
        success: true,
        data: disableResponse,
      });

      renderDashboard();

      // Wait for guilds to load
      await waitFor(() => {
        expect(screen.getByText('Test Server')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      const enabledToggle = toggles[0]!; // First guild starts enabled

      // Verify initial state
      expect(enabledToggle).toBeChecked();

      await act(async () => {
        fireEvent.click(enabledToggle);
      });

      // After successful disable, toggle should be unchecked
      await waitFor(() => {
        expect(enabledToggle).not.toBeChecked();
      });
    });

    it('should prevent state mismatch when enable/disable API call is in progress', async () => {
      // BEHAVIOR: Toggle should update state immediately (optimistic update)
      // WHY: Provides immediate feedback even during API call

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      // Make enable call hang
      vi.mocked(apiClient.enableGuild).mockImplementation(
        () => new Promise(() => {})
      );

      renderDashboard();

      // Wait for guilds to load
      await waitFor(() => {
        expect(screen.getByText('Another Server')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      const disabledToggle = toggles[1]!;

      // Initial state: unchecked
      expect(disabledToggle).not.toBeChecked();

      await act(async () => {
        fireEvent.click(disabledToggle);
      });

      // Optimistic update should show checked state immediately
      expect(disabledToggle).toBeChecked();
    });

    it('should revert toggle state on API failure', async () => {
      // BEHAVIOR: If enable/disable API fails, toggle must revert to previous state
      // WHY: UI state must match server state; optimistic update must be rolled back

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      vi.mocked(apiClient.enableGuild).mockResolvedValue({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Failed to enable guild',
      });

      renderDashboard();

      // Wait for guilds to load
      await waitFor(() => {
        expect(screen.getByText('Another Server')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      const disabledToggle = toggles[1]!;

      // Initial state: unchecked
      expect(disabledToggle).not.toBeChecked();

      await act(async () => {
        fireEvent.click(disabledToggle);
      });

      // After API failure, should revert to unchecked
      await waitFor(() => {
        expect(disabledToggle).not.toBeChecked();
      });
    });

    it('should show error message when toggle operation fails', async () => {
      // BEHAVIOR: When enable/disable fails, display error message to user
      // WHY: User needs feedback on why operation failed

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      vi.mocked(apiClient.enableGuild).mockResolvedValue({
        success: false,
        error: 'API_ERROR',
        message: 'Server error while enabling guild',
      });

      renderDashboard();

      // Wait for guilds to load
      await waitFor(() => {
        expect(screen.getByText('Another Server')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      const disabledToggle = toggles[1]!;

      await act(async () => {
        fireEvent.click(disabledToggle);
      });

      // Should display error message
      await waitFor(() => {
        expect(
          screen.getByText(/server error while enabling guild/i)
        ).toBeInTheDocument();
      });
    });

    it('should allow updating multiple guilds independently', async () => {
      // BEHAVIOR: Each guild toggle operates independently
      // WHY: User should be able to manage multiple guilds concurrently

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      // Mock both enable and disable to succeed
      vi.mocked(apiClient.enableGuild).mockResolvedValue({
        success: true,
        data: {
          success: true,
          guildId: '987654321098765432',
          enabled: true,
        },
      });
      vi.mocked(apiClient.disableGuild).mockResolvedValue({
        success: true,
        data: {
          success: true,
          guildId: '123456789012345678',
          enabled: false,
        },
      });

      renderDashboard();

      // Wait for guilds to load
      await waitFor(() => {
        expect(screen.getByText('Another Server')).toBeInTheDocument();
      });

      const toggles = screen.getAllByRole('switch');
      const toggle1 = toggles[0]!; // Enabled
      const toggle2 = toggles[1]!; // Disabled

      // Disable first guild
      await act(async () => {
        fireEvent.click(toggle1);
      });

      // Enable second guild
      await act(async () => {
        fireEvent.click(toggle2);
      });

      // Both should update independently
      await waitFor(() => {
        expect(toggle1).not.toBeChecked();
        expect(toggle2).toBeChecked();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing token gracefully', async () => {
      // BEHAVIOR: If no token is stored, should not crash
      // WHY: Defensive programming; shouldn't happen if auth is working, but prevents crashes
      // NOTE: In practice, AuthContext should prevent rendering dashboard without auth

      vi.mocked(tokenStorage.getToken).mockReturnValue(null);

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'No token provided',
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'No token provided',
      });

      await act(async () => {
        renderDashboard();
      });

      // Should show error, not crash
      await waitFor(() => {
        expect(screen.getByText(/no authentication token found/i)).toBeInTheDocument();
      });
    });

    it('should handle guild list with single guild correctly', async () => {
      // BEHAVIOR: Single-item array should render correctly (no special cases needed)
      // WHY: Proves table rendering isn't hardcoded for multiple items

      const singleGuild: GuildSummary = {
        guildId: '111111111111111111',
        name: 'Solo Server',
        enabled: true,
        connected: false,
      };

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: { ...mockStatus, guilds: 1 },
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: { guilds: [singleGuild] },
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Solo Server')).toBeInTheDocument();
        expect(screen.getByText('111111111111111111')).toBeInTheDocument();
      });
    });

    it('should handle very large memory values', async () => {
      // BEHAVIOR: Memory formatter should handle large values (GB range)
      // WHY: Bot could have high memory usage; formatter shouldn't break

      const largeMemoryStatus: StatusResponse = {
        guilds: 1,
        voiceConnections: 0,
        memory: {
          heapUsed: 2147483648, // 2 GB
          heapTotal: 4294967296, // 4 GB
          rss: 5368709120, // 5 GB
        },
      };

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: largeMemoryStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: { guilds: [] },
      });

      renderDashboard();

      await waitFor(() => {
        // 2147483648 bytes = 2048 MB
        expect(screen.getByText(/2048.*MB/i)).toBeInTheDocument();
      });
    });

    it('should handle zero values in bot status', async () => {
      // BEHAVIOR: Zero values should display as "0", not empty or error
      // WHY: Zero is a valid state (no guilds, no connections)

      const zeroStatus: StatusResponse = {
        guilds: 0,
        voiceConnections: 0,
        memory: {
          heapUsed: 0,
          heapTotal: 0,
          rss: 0,
        },
      };

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: zeroStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: { guilds: [] },
      });

      renderDashboard();

      await waitFor(() => {
        // Should show "0" for guilds and connections
        const zeros = screen.getAllByText('0');
        expect(zeros.length).toBeGreaterThan(0);
      });
    });

    it('should disable refresh button while loading to prevent concurrent requests', async () => {
      // BEHAVIOR: Refresh button must be disabled during data fetch
      // WHY: Prevents multiple concurrent refresh operations

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      // Wait for initial load
      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Make next fetch hang so button stays disabled during load
      vi.mocked(apiClient.getStatus).mockImplementation(
        () => new Promise(() => {})
      );

      const refreshButton = screen.getByRole('button', { name: /refresh/i });

      // Click refresh
      await act(async () => {
        fireEvent.click(refreshButton);
      });

      // Button should be disabled while loading
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('Token Retrieval', () => {
    it('should retrieve token from storage on mount', async () => {
      // BEHAVIOR: Component must call getToken() to retrieve auth token
      // WHY: Token is needed for all API calls

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      await act(async () => {
        renderDashboard();
      });

      expect(tokenStorage.getToken).toHaveBeenCalled();
    });

    it('should use retrieved token for all API calls', async () => {
      // BEHAVIOR: Token from storage must be passed to all API functions
      // WHY: Ensures authenticated access to protected endpoints

      const customToken = 'custom-token-xyz';
      vi.mocked(tokenStorage.getToken).mockReturnValue(customToken);

      vi.mocked(apiClient.getStatus).mockResolvedValue({
        success: true,
        data: mockStatus,
      });
      vi.mocked(apiClient.getGuilds).mockResolvedValue({
        success: true,
        data: mockGuildsResponse,
      });

      renderDashboard();

      await waitFor(() => {
        expect(apiClient.getStatus).toHaveBeenCalledWith(customToken);
        expect(apiClient.getGuilds).toHaveBeenCalledWith(customToken);
      });
    });
  });
});
