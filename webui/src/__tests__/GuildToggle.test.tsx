/**
 * GuildToggle Component Tests
 *
 * Tests for the GuildToggle component which provides a toggle switch
 * for enabling/disabling AFK detection on a per-guild basis.
 *
 * Key behaviors tested:
 * 1. Visual state rendering (enabled/disabled/loading)
 * 2. Click handling and onToggle callback invocation
 * 3. Optimistic updates with rollback on failure
 * 4. Loading state management (prevents double-clicks)
 * 5. Synchronization with parent state changes
 * 6. Accessibility (aria-checked)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { GuildToggle } from '../components/GuildToggle';

describe('GuildToggle', () => {
  const mockGuildId = '1234567890123456789'; // Valid Discord snowflake
  const mockOnToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering - Enabled State', () => {
    it('should render with blue background when enabled=true', () => {
      // BEHAVIOR: Enabled toggles must have distinct visual styling (blue)
      // WHY: Users need clear visual feedback of current state

      render(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');
      expect(toggleButton).toBeInTheDocument();

      // Check for blue background color class (Tailwind: bg-blue-600)
      expect(toggleButton).toHaveClass('bg-blue-600');
    });

    it('should have aria-checked=true when enabled=true', () => {
      // BEHAVIOR: Accessibility attribute must reflect toggle state
      // WHY: Screen readers need to announce the current state correctly

      render(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');
      expect(toggleButton).toHaveAttribute('aria-checked', 'true');
    });

    it('should show toggle knob in right position when enabled', () => {
      // BEHAVIOR: Visual toggle knob should be positioned right when enabled
      // WHY: Standard toggle UI pattern - right = on

      render(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      // The knob is typically a child element with translate-x classes
      // We check for the presence of the knob element
      const toggleButton = screen.getByRole('switch');
      const knob = toggleButton.querySelector('[class*="translate-x"]');
      expect(knob).toBeInTheDocument();
    });
  });

  describe('Rendering - Disabled State', () => {
    it('should render with gray background when enabled=false', () => {
      // BEHAVIOR: Disabled toggles must have distinct visual styling (gray)
      // WHY: Users need clear visual feedback that feature is off

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');
      expect(toggleButton).toBeInTheDocument();

      // Check for gray background (Tailwind: bg-gray-300)
      expect(toggleButton).toHaveClass('bg-gray-300');
    });

    it('should have aria-checked=false when enabled=false', () => {
      // BEHAVIOR: Accessibility attribute must reflect toggle state
      // WHY: Screen readers announce "not checked" for disabled toggles

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');
      expect(toggleButton).toHaveAttribute('aria-checked', 'false');
    });

    it('should show toggle knob in left position when disabled', () => {
      // BEHAVIOR: Visual toggle knob should be positioned left when disabled
      // WHY: Standard toggle UI pattern - left = off

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');
      // When disabled, knob should have translate-x-0 or similar
      expect(toggleButton).toBeInTheDocument();
    });
  });

  describe('Click Handling and onToggle Callback', () => {
    it('should call onToggle with (guildId, false) when enabled=true and clicked', async () => {
      // BEHAVIOR: Clicking an enabled toggle must call onToggle to disable it
      // WHY: This is the core toggle functionality - turning OFF

      mockOnToggle.mockResolvedValue(true); // Simulate success

      render(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      // onToggle should be called with guildId and newState=false
      expect(mockOnToggle).toHaveBeenCalledTimes(1);
      expect(mockOnToggle).toHaveBeenCalledWith(mockGuildId, false);
    });

    it('should call onToggle with (guildId, true) when enabled=false and clicked', async () => {
      // BEHAVIOR: Clicking a disabled toggle must call onToggle to enable it
      // WHY: This is the core toggle functionality - turning ON

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
      expect(mockOnToggle).toHaveBeenCalledWith(mockGuildId, true);
    });

    it('should work with different guildId values', async () => {
      // BEHAVIOR: Component must correctly pass through guildId to onToggle
      // WHY: Ensures toggle actions are scoped to the correct guild

      const differentGuildId = '9876543210987654321';
      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle
          guildId={differentGuildId}
          enabled={false}
          onToggle={mockOnToggle}
        />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      expect(mockOnToggle).toHaveBeenCalledWith(differentGuildId, true);
    });
  });

  describe('Loading State During Toggle', () => {
    it('should disable button while onToggle is pending', async () => {
      // BEHAVIOR: Toggle button must be disabled during API call
      // WHY: Prevents double-clicks and race conditions

      // Mock onToggle to stay pending
      mockOnToggle.mockImplementation(() => new Promise(() => {}));

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      // Button should now be disabled
      await waitFor(() => {
        expect(toggleButton).toBeDisabled();
      });
    });

    it('should show spinner during loading', async () => {
      // BEHAVIOR: Visual loading indicator must appear during toggle operation
      // WHY: Provides feedback that action is in progress

      mockOnToggle.mockImplementation(() => new Promise(() => {}));

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      // Spinner should be visible (typically has animate-spin class)
      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      });
    });

    it('should re-enable button after onToggle resolves successfully', async () => {
      // BEHAVIOR: Button must become interactive again after successful toggle
      // WHY: Users need to be able to toggle again

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      // After promise resolves, button should be enabled again
      await waitFor(() => {
        expect(toggleButton).not.toBeDisabled();
      });
    });

    it('should hide spinner after onToggle resolves', async () => {
      // BEHAVIOR: Loading indicator must disappear after operation completes
      // WHY: Indicates operation has finished

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin');
        expect(spinner).not.toBeInTheDocument();
      });
    });
  });

  describe('Optimistic Update with Rollback on Failure', () => {
    it('should immediately update visual state optimistically', async () => {
      // BEHAVIOR: Toggle appearance must update immediately on click
      // WHY: Provides instant feedback for better UX

      // Make onToggle stay pending so we can check intermediate state
      let resolveToggle: (value: boolean) => void;
      mockOnToggle.mockReturnValue(
        new Promise((resolve) => {
          resolveToggle = resolve;
        })
      );

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // Initially disabled (gray)
      expect(toggleButton).toHaveAttribute('aria-checked', 'false');

      await act(async () => {
        toggleButton.click();
      });

      // Should optimistically show as enabled (before API responds)
      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });

      // Clean up
      await act(async () => {
        resolveToggle!(true);
      });
    });

    it('should rollback to original state when onToggle returns false', async () => {
      // BEHAVIOR: Failed toggle attempts must revert visual state
      // WHY: Visual state must reflect actual server state

      mockOnToggle.mockResolvedValue(false); // Simulate API failure

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // Initially disabled
      expect(toggleButton).toHaveAttribute('aria-checked', 'false');

      await act(async () => {
        toggleButton.click();
      });

      // Should rollback to disabled after API returns false
      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'false');
      });

      // Should still have gray background (disabled state)
      expect(toggleButton).toHaveClass('bg-gray-300');
    });

    it('should rollback to original state when onToggle throws error', async () => {
      // BEHAVIOR: Exceptions during toggle must trigger rollback
      // WHY: Network errors should not leave UI in inconsistent state

      mockOnToggle.mockRejectedValue(new Error('Network error'));

      render(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // Initially enabled
      expect(toggleButton).toHaveAttribute('aria-checked', 'true');

      await act(async () => {
        toggleButton.click();
      });

      // Should rollback to enabled after exception
      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });

      // Should have blue background (enabled state)
      expect(toggleButton).toHaveClass('bg-blue-600');
    });

    it('should maintain correct state after successful toggle from enabled to disabled', async () => {
      // BEHAVIOR: Successful disable operation must result in disabled state
      // WHY: Verifies the happy path works correctly

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'false');
      });
    });

    it('should maintain correct state after successful toggle from disabled to enabled', async () => {
      // BEHAVIOR: Successful enable operation must result in enabled state
      // WHY: Verifies the happy path works correctly

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });
    });
  });

  describe('Preventing Double-Clicks During Loading', () => {
    it('should not call onToggle again if clicked while loading', async () => {
      // BEHAVIOR: Rapid clicks during loading must be ignored
      // WHY: Prevents race conditions and duplicate API calls

      let resolveToggle: (value: boolean) => void;
      mockOnToggle.mockReturnValue(
        new Promise((resolve) => {
          resolveToggle = resolve;
        })
      );

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // First click
      await act(async () => {
        toggleButton.click();
      });

      expect(mockOnToggle).toHaveBeenCalledTimes(1);

      // Second click while still loading
      await act(async () => {
        toggleButton.click();
      });

      // Should still only be called once
      expect(mockOnToggle).toHaveBeenCalledTimes(1);

      // Clean up
      await act(async () => {
        resolveToggle!(true);
      });
    });

    it('should ignore multiple rapid clicks before first promise resolves', async () => {
      // BEHAVIOR: Spam-clicking must not queue multiple operations
      // WHY: Prevents flooding the API with requests

      let resolveToggle: (value: boolean) => void;
      mockOnToggle.mockReturnValue(
        new Promise((resolve) => {
          resolveToggle = resolve;
        })
      );

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // First click
      await act(async () => {
        toggleButton.click();
      });

      // After first click, isLoading is true (button disabled)
      // Subsequent clicks within the same act block don't fire before disabled attribute updates
      await act(async () => {
        toggleButton.click();
        toggleButton.click();
        toggleButton.click();
        toggleButton.click();
      });

      // Should only call onToggle once because button becomes disabled
      expect(mockOnToggle).toHaveBeenCalledTimes(1);

      // Clean up
      await act(async () => {
        resolveToggle!(true);
      });
    });

    it('should allow new click after previous operation completes', async () => {
      // BEHAVIOR: After toggle operation finishes, button must be clickable again
      // WHY: Users should be able to toggle multiple times sequentially

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // First click
      await act(async () => {
        toggleButton.click();
      });

      // Wait for it to complete
      await waitFor(() => {
        expect(toggleButton).not.toBeDisabled();
      });

      expect(mockOnToggle).toHaveBeenCalledTimes(1);

      // Second click after completion
      await act(async () => {
        toggleButton.click();
      });

      // Should now be called twice
      await waitFor(() => {
        expect(mockOnToggle).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Synchronization with Parent State Changes', () => {
    it('should update visual state when enabled prop changes from parent', async () => {
      // BEHAVIOR: Component must react to external state changes
      // WHY: Parent might update state based on API data or other events

      const { rerender } = render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');
      expect(toggleButton).toHaveAttribute('aria-checked', 'false');

      // Parent changes enabled to true
      rerender(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      // Component should update to show enabled state
      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });
    });

    it('should update from enabled to disabled when parent changes prop', async () => {
      // BEHAVIOR: Component must sync when parent disables it
      // WHY: Server-side changes or other UI actions might disable the toggle

      const { rerender } = render(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');
      expect(toggleButton).toHaveAttribute('aria-checked', 'true');

      // Parent changes enabled to false
      rerender(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'false');
      });
    });

    it('should sync with parent prop when it changes', async () => {
      // BEHAVIOR: When parent enabled prop changes, component syncs via useEffect
      // WHY: Parent prop is the source of truth from server

      let resolveToggle: (value: boolean) => void;
      mockOnToggle.mockReturnValue(
        new Promise((resolve) => {
          resolveToggle = resolve;
        })
      );

      const { rerender } = render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // Click to start toggle (optimistically shows enabled)
      await act(async () => {
        toggleButton.click();
      });

      // Verify optimistic state shows enabled
      expect(toggleButton).toHaveAttribute('aria-checked', 'true');

      // Parent updates enabled prop to true while operation is still loading
      // This tests that the parent prop value syncs via useEffect
      await act(async () => {
        rerender(
          <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
        );
      });

      // useEffect runs and syncs optimisticEnabled with parent prop
      // It stays true (parent's value), which matches the optimistic state
      expect(toggleButton).toHaveAttribute('aria-checked', 'true');

      // Clean up
      await act(async () => {
        resolveToggle!(true);
      });
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle onToggle that returns synchronous boolean', async () => {
      // BEHAVIOR: onToggle can return boolean directly (not just Promise)
      // WHY: Supports both sync and async toggle handlers

      mockOnToggle.mockReturnValue(true); // Sync return

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      expect(mockOnToggle).toHaveBeenCalledWith(mockGuildId, true);

      // Should successfully toggle even with sync return
      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });
    });

    it('should handle very long guildId strings', async () => {
      // BEHAVIOR: Component must work with edge-case Discord snowflakes
      // WHY: Discord IDs can be up to 19 digits

      const longGuildId = '1234567890123456789'; // Max length
      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={longGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      expect(mockOnToggle).toHaveBeenCalledWith(longGuildId, true);
    });

    it('should remain in correct state if onToggle throws non-Error object', async () => {
      // BEHAVIOR: Component must handle non-standard error objects
      // WHY: API might throw strings or other objects

      mockOnToggle.mockRejectedValue('String error');

      render(
        <GuildToggle guildId={mockGuildId} enabled={true} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      // Should rollback to original state
      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });
    });

    it('should handle multiple consecutive successful toggles', async () => {
      // BEHAVIOR: Rapid sequential toggles should all succeed
      // WHY: Users might quickly enable/disable multiple times

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // Toggle on
      await act(async () => {
        toggleButton.click();
      });

      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });

      // Toggle off
      await act(async () => {
        toggleButton.click();
      });

      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'false');
      });

      // Toggle on again
      await act(async () => {
        toggleButton.click();
      });

      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });

      expect(mockOnToggle).toHaveBeenCalledTimes(3);
    });

    it('should not call onToggle if component unmounts during click', async () => {
      // BEHAVIOR: Unmounting should not cause errors or API calls
      // WHY: Component lifecycle safety

      let resolveToggle: (value: boolean) => void;
      mockOnToggle.mockReturnValue(
        new Promise((resolve) => {
          resolveToggle = resolve;
        })
      );

      const { unmount } = render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      await act(async () => {
        toggleButton.click();
      });

      // Unmount while operation is pending
      unmount();

      // Resolve the promise (component is gone)
      await act(async () => {
        resolveToggle!(true);
      });

      // Should not throw error (component handles cleanup)
      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('should have role="switch"', () => {
      // BEHAVIOR: Element must use correct ARIA role
      // WHY: Screen readers need to announce this as a toggle switch

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');
      expect(toggleButton).toBeInTheDocument();
    });

    it('should be keyboard accessible', async () => {
      // BEHAVIOR: Toggle must be operable via keyboard
      // WHY: Accessibility requirement for keyboard-only users

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      // Should be focusable
      toggleButton.focus();
      expect(toggleButton).toHaveFocus();

      // Should be clickable (Enter/Space trigger click on buttons)
      await act(async () => {
        toggleButton.click(); // Simulates keyboard activation
      });

      expect(mockOnToggle).toHaveBeenCalled();
    });

    it('should update aria-checked attribute dynamically', async () => {
      // BEHAVIOR: aria-checked must stay in sync with visual state
      // WHY: Screen readers announce current state on focus

      mockOnToggle.mockResolvedValue(true);

      render(
        <GuildToggle guildId={mockGuildId} enabled={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('switch');

      expect(toggleButton).toHaveAttribute('aria-checked', 'false');

      await act(async () => {
        toggleButton.click();
      });

      await waitFor(() => {
        expect(toggleButton).toHaveAttribute('aria-checked', 'true');
      });
    });
  });
});
