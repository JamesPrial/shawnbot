/**
 * Dashboard Page Component
 *
 * Main admin dashboard showing bot status and guild management.
 * Features:
 * - Bot status panel (guilds, voice connections, memory)
 * - Guild list table with enable/disable toggles
 * - Manual refresh button
 * - Loading and error states
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/useAuth';
import { getToken } from '../auth/tokenStorage';
import { getStatus, getGuilds, enableGuild, disableGuild } from '../api/client';
import { GuildToggle } from '../components/GuildToggle';
import type { StatusResponse, GuildSummary } from '../api/types';

/**
 * Dashboard page component
 * Displays bot status and guild management interface
 */
export function DashboardPage(): JSX.Element {
  const { logout } = useAuth();
  const [botStatus, setBotStatus] = useState<StatusResponse | null>(null);
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  /**
   * Fetch bot status and guild list
   * Called on mount and when user clicks refresh
   */
  const fetchData = useCallback(async (): Promise<void> => {
    const token = getToken();

    if (!token) {
      setError('No authentication token found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setToastError(null);

    try {
      // Fetch bot status and guilds in parallel
      const [statusResult, guildsResult] = await Promise.all([
        getStatus(token),
        getGuilds(token),
      ]);

      // Handle status response
      if (!statusResult.success) {
        if (statusResult.error === 'UNAUTHORIZED') {
          // Token is invalid, trigger logout
          logout();
          return;
        }
        throw new Error(statusResult.message);
      }

      // Handle guilds response
      if (!guildsResult.success) {
        if (guildsResult.error === 'UNAUTHORIZED') {
          // Token is invalid, trigger logout
          logout();
          return;
        }
        throw new Error(guildsResult.message);
      }

      // Update state with successful results
      setBotStatus(statusResult.data);
      setGuilds(guildsResult.data.guilds);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';

      // If we have existing data, show toast error, otherwise show full error
      if (botStatus) {
        setToastError(message);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [botStatus, logout]);

  /**
   * Initial data fetch on mount
   */
  useEffect(() => {
    void fetchData();
    // Only run on mount, not when fetchData changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handle guild enable/disable toggle
   * Called by GuildToggle component after optimistic update
   * Returns true if API call succeeded, false otherwise
   */
  const handleToggle = useCallback(
    async (guildId: string, newEnabled: boolean): Promise<boolean> => {
      const token = getToken();

      if (!token) {
        setToastError('No authentication token found');
        return false;
      }

      try {
        // Make API call
        const result = newEnabled
          ? await enableGuild(token, guildId)
          : await disableGuild(token, guildId);

        if (!result.success) {
          if (result.error === 'UNAUTHORIZED') {
            logout();
            return false;
          }

          setToastError(result.message);
          return false;
        }

        // Update guilds state on success
        setGuilds((current) =>
          current.map((guild) =>
            guild.guildId === result.data.guildId
              ? { ...guild, enabled: result.data.enabled }
              : guild
          )
        );

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update guild';
        setToastError(message);
        return false;
      }
    },
    [logout]
  );

  /**
   * Format bytes to human-readable string
   */
  const formatBytes = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  /**
   * Dismiss toast error
   */
  const dismissToast = useCallback((): void => {
    setToastError(null);
  }, []);

  // Loading state - show only on initial load
  if (isLoading && !botStatus) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex items-center text-gray-600">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600 mr-3"></div>
          <span className="text-lg">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  // Error state - show only if no data and we have an error
  if (error && !botStatus) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="text-red-600 text-5xl mb-4">⚠</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to Load Dashboard</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => void fetchData()}
                className="bg-blue-600 text-white py-2 px-6 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={logout}
                className="bg-gray-200 text-gray-700 py-2 px-6 rounded-md font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">ShawnBot Admin</h1>
          <div className="flex gap-3">
            <button
              onClick={() => void fetchData()}
              disabled={isLoading}
              className="bg-white text-gray-700 py-2 px-4 rounded-md font-medium border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-gray-700 mr-2"></div>
                  Refreshing...
                </span>
              ) : (
                'Refresh'
              )}
            </button>
            <button
              onClick={logout}
              className="bg-red-600 text-white py-2 px-4 rounded-md font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Bot Status Panel */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Bot Status</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-500 mb-1">Guilds</span>
                <span className="text-2xl font-bold text-gray-900">
                  {botStatus?.guilds ?? '-'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-500 mb-1">Voice Connections</span>
                <span className="text-2xl font-bold text-gray-900">
                  {botStatus?.voiceConnections ?? '-'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-500 mb-1">Memory Usage</span>
                <span className="text-2xl font-bold text-gray-900">
                  {botStatus ? formatBytes(botStatus.memory.heapUsed) : '-'}
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  {botStatus ? `of ${formatBytes(botStatus.memory.heapTotal)} allocated` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Guild Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Guilds</h2>
          </div>

          {guilds.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Name
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Guild ID
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      AFK Detection
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Voice Connected
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {guilds.map((guild) => (
                    <tr key={guild.guildId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {guild.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {guild.guildId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center gap-3">
                          <GuildToggle
                            guildId={guild.guildId}
                            enabled={guild.enabled}
                            onToggle={handleToggle}
                          />
                          <span className="text-sm">
                            {guild.enabled ? (
                              <span className="text-blue-600 font-medium">Enabled</span>
                            ) : (
                              <span className="text-gray-500">Disabled</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <div
                            className={`h-2 w-2 rounded-full mr-2 ${
                              guild.connected ? 'bg-green-500' : 'bg-gray-400'
                            }`}
                          />
                          <span>{guild.connected ? 'Connected' : 'Not Connected'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="text-gray-400 text-5xl mb-4">🤖</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Guilds Found</h3>
              <p className="text-gray-500">The bot is not currently in any servers.</p>
            </div>
          )}
        </div>

        {/* Error Toast */}
        {toastError && (
          <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-md">
            <div className="flex items-start">
              <div className="flex-1">
                <p className="font-medium">Error</p>
                <p className="text-sm">{toastError}</p>
              </div>
              <button
                onClick={dismissToast}
                className="ml-4 text-red-700 hover:text-red-900 focus:outline-none"
                aria-label="Dismiss error"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
