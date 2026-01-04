/**
 * Guild Toggle Component
 *
 * A toggle switch for enabling/disabling AFK detection for a guild.
 * Features:
 * - Optimistic UI updates for immediate feedback
 * - Automatic rollback on failure
 * - Loading state with spinner indicator
 * - Syncs with parent state changes
 * - Accessible ARIA attributes
 */

import { useState, useEffect } from 'react';

/**
 * Props for the GuildToggle component
 */
interface GuildToggleProps {
  /** Discord guild ID (snowflake) */
  guildId: string;

  /** Current enabled state from the server */
  enabled: boolean;

  /**
   * Callback invoked when toggle is clicked
   * @param guildId - The guild ID being toggled
   * @param newEnabled - The new desired state
   * @returns Promise resolving to true if successful, false otherwise
   */
  onToggle: (guildId: string, newEnabled: boolean) => Promise<boolean>;
}

/**
 * Toggle switch component for enabling/disabling guild AFK detection
 *
 * Uses optimistic updates: immediately reflects the new state in the UI,
 * then rolls back if the server request fails. This provides responsive
 * feedback while maintaining consistency with server state.
 */
export function GuildToggle({ guildId, enabled, onToggle }: GuildToggleProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState(enabled);

  // Sync optimistic state with parent when enabled prop changes
  // This ensures consistency when parent refreshes data from server
  useEffect(() => {
    setOptimisticEnabled(enabled);
  }, [enabled]);

  const handleToggle = async (): Promise<void> => {
    if (isLoading) return;

    const newState = !optimisticEnabled;
    setOptimisticEnabled(newState); // Optimistic update
    setIsLoading(true);

    try {
      const success = await onToggle(guildId, newState);
      if (!success) {
        // Rollback on failure
        setOptimisticEnabled(!newState);
      }
    } catch {
      // Rollback on error
      setOptimisticEnabled(!newState);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isLoading}
      className={`
        relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${optimisticEnabled ? 'bg-blue-600' : 'bg-gray-300'}
        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      role="switch"
      aria-checked={optimisticEnabled}
      aria-label={`${optimisticEnabled ? 'Disable' : 'Enable'} AFK detection`}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
          transition duration-200 ease-in-out
          ${optimisticEnabled ? 'translate-x-5' : 'translate-x-0'}
        `}
      >
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="animate-spin h-3 w-3 border-2 border-gray-400 border-t-transparent rounded-full" />
          </span>
        )}
      </span>
    </button>
  );
}
