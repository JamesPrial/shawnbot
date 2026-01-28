import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestSnowflake,
  createTestGuildId,
  createTestUserId,
  createTestChannelId,
  createTestRoleId,
  createTestGuildIds,
  createTestUserIds,
  createTestChannelIds,
  createTestRoleIds,
  assertValidGuildId,
  assertValidUserId,
  assertValidChannelId,
  assertValidRoleId,
  resetSnowflakeCounter,
} from './testHelpers';
import {
  isGuildId,
  isUserId,
  isChannelId,
  isRoleId,
  type GuildId,
  type UserId,
  type ChannelId,
  type RoleId,
} from '../types/ids';
import { createMockGuildSettings, ENABLED_CONFIG, DISABLED_CONFIG } from './fixtures';

/**
 * Tests for test helper utilities that support branded type testing.
 *
 * PHILOSOPHY: These tests prove that our test helpers correctly generate valid Discord IDs
 * and branded types. They verify both format correctness and uniqueness guarantees.
 *
 * WHY: Test helpers are infrastructure - if they're broken, all tests using them may
 * produce false positives. We must prove the helpers work correctly.
 */

describe('testHelpers', () => {
  beforeEach(() => {
    // Reset counter to ensure deterministic test behavior
    resetSnowflakeCounter();
  });

  describe('createTestSnowflake', () => {
    describe('format validation', () => {
      it('should return a string', () => {
        // WHY: Discord snowflakes are string types, not numbers
        const snowflake = createTestSnowflake();
        expect(typeof snowflake).toBe('string');
      });

      it('should return a 17-19 digit numeric string', () => {
        // WHY: Discord snowflakes are specifically 17-19 digits per Discord API spec
        const snowflake = createTestSnowflake();

        expect(snowflake).toMatch(/^\d+$/);
        expect(snowflake.length).toBeGreaterThanOrEqual(17);
        expect(snowflake.length).toBeLessThanOrEqual(19);
      });

      it('should return a value that passes isGuildId validation', () => {
        // WHY: Generated snowflakes must be valid for use as any Discord ID type
        const snowflake = createTestSnowflake();
        expect(isGuildId(snowflake)).toBe(true);
      });

      it('should return a value that passes all ID type validations', () => {
        // WHY: Snowflakes are the base format for all Discord IDs
        const snowflake = createTestSnowflake();

        expect(isGuildId(snowflake)).toBe(true);
        expect(isUserId(snowflake)).toBe(true);
        expect(isChannelId(snowflake)).toBe(true);
        expect(isRoleId(snowflake)).toBe(true);
      });

      it('should not include leading zeros after first digit', () => {
        // WHY: Leading zeros would be semantically incorrect and could cause issues
        // when IDs are parsed as numbers or compared
        const snowflake = createTestSnowflake();

        // First character should not be '0' for generated snowflakes
        expect(snowflake[0]).not.toBe('0');
      });
    });

    describe('uniqueness guarantees', () => {
      it('should return unique values on consecutive calls', () => {
        // WHY: Tests often need multiple distinct entities. Collisions would cause false test failures.
        const id1 = createTestSnowflake();
        const id2 = createTestSnowflake();
        const id3 = createTestSnowflake();

        expect(id1).not.toBe(id2);
        expect(id2).not.toBe(id3);
        expect(id1).not.toBe(id3);
      });

      it('should return unique values across 1000 calls', () => {
        // WHY: Edge case - tests with many entities must not have collisions
        const snowflakes = new Set<string>();

        for (let i = 0; i < 1000; i++) {
          snowflakes.add(createTestSnowflake());
        }

        expect(snowflakes.size).toBe(1000);
      });

      it('should maintain uniqueness after counter reset', () => {
        // WHY: Even if counter is reset between tests, we need to verify the mechanism works
        // and that values generated after reset are unique from other values
        const firstValue = createTestSnowflake();
        const secondValue = createTestSnowflake();
        resetSnowflakeCounter();
        const afterReset = createTestSnowflake();

        // The first value after reset matches the first value before reset (deterministic)
        expect(firstValue).toBe(afterReset);
        // But it's different from the second value (uniqueness within a sequence)
        expect(secondValue).not.toBe(afterReset);
      });
    });

    describe('edge cases', () => {
      it('should handle rapid successive calls without collision', () => {
        // WHY: Tests may create entities in tight loops
        const ids = Array.from({ length: 100 }, () => createTestSnowflake());
        const uniqueIds = new Set(ids);

        expect(uniqueIds.size).toBe(ids.length);
      });

      it('should never return empty string', () => {
        // WHY: Empty strings are invalid snowflakes
        for (let i = 0; i < 10; i++) {
          const snowflake = createTestSnowflake();
          expect(snowflake.length).toBeGreaterThan(0);
        }
      });

      it('should never return undefined or null', () => {
        // WHY: Type safety verification at runtime
        const snowflake = createTestSnowflake();
        expect(snowflake).toBeDefined();
        expect(snowflake).not.toBeNull();
      });
    });
  });

  describe('branded type factories', () => {
    describe('createTestGuildId', () => {
      it('should return a valid GuildId branded type', () => {
        // WHY: The return value must be properly branded, not just a string
        const guildId = createTestGuildId();

        // Type assertion should succeed
        assertValidGuildId(guildId);

        // Runtime validation should pass
        expect(isGuildId(guildId)).toBe(true);
      });

      it('should return unique values on each call', () => {
        // WHY: Tests need multiple distinct guilds
        const id1 = createTestGuildId();
        const id2 = createTestGuildId();
        const id3 = createTestGuildId();

        expect(id1).not.toBe(id2);
        expect(id2).not.toBe(id3);
        expect(id1).not.toBe(id3);
      });

      it('should return values that satisfy GuildId type constraints', () => {
        // WHY: Compile-time and runtime type safety must align
        const guildId: GuildId = createTestGuildId();

        expect(typeof guildId).toBe('string');
        expect(guildId).toMatch(/^\d{17,19}$/);
      });

      it('should create 50 unique guild IDs without collision', () => {
        // WHY: Stress test uniqueness for realistic test scenarios
        const guildIds = Array.from({ length: 50 }, () => createTestGuildId());
        const uniqueGuildIds = new Set(guildIds);

        expect(uniqueGuildIds.size).toBe(50);
      });
    });

    describe('createTestUserId', () => {
      it('should return a valid UserId branded type', () => {
        // WHY: UserId must be distinct from other ID types at compile time
        const userId = createTestUserId();

        assertValidUserId(userId);
        expect(isUserId(userId)).toBe(true);
      });

      it('should return unique values on each call', () => {
        // WHY: Tests need multiple distinct users
        const id1 = createTestUserId();
        const id2 = createTestUserId();

        expect(id1).not.toBe(id2);
      });

      it('should return values that satisfy UserId type constraints', () => {
        // WHY: Type safety verification
        const userId: UserId = createTestUserId();

        expect(typeof userId).toBe('string');
        expect(userId).toMatch(/^\d{17,19}$/);
      });
    });

    describe('createTestChannelId', () => {
      it('should return a valid ChannelId branded type', () => {
        // WHY: ChannelId must be distinct from other ID types at compile time
        const channelId = createTestChannelId();

        assertValidChannelId(channelId);
        expect(isChannelId(channelId)).toBe(true);
      });

      it('should return unique values on each call', () => {
        // WHY: Tests need multiple distinct channels
        const id1 = createTestChannelId();
        const id2 = createTestChannelId();

        expect(id1).not.toBe(id2);
      });

      it('should return values that satisfy ChannelId type constraints', () => {
        // WHY: Type safety verification
        const channelId: ChannelId = createTestChannelId();

        expect(typeof channelId).toBe('string');
        expect(channelId).toMatch(/^\d{17,19}$/);
      });
    });

    describe('createTestRoleId', () => {
      it('should return a valid RoleId branded type', () => {
        // WHY: RoleId must be distinct from other ID types at compile time
        const roleId = createTestRoleId();

        assertValidRoleId(roleId);
        expect(isRoleId(roleId)).toBe(true);
      });

      it('should return unique values on each call', () => {
        // WHY: Tests need multiple distinct roles
        const id1 = createTestRoleId();
        const id2 = createTestRoleId();

        expect(id1).not.toBe(id2);
      });

      it('should return values that satisfy RoleId type constraints', () => {
        // WHY: Type safety verification
        const roleId: RoleId = createTestRoleId();

        expect(typeof roleId).toBe('string');
        expect(roleId).toMatch(/^\d{17,19}$/);
      });
    });

    describe('cross-factory uniqueness', () => {
      it('should generate unique IDs across different factory types', () => {
        // WHY: While type-distinct, IDs should still be unique across types to avoid confusion
        const guildId = createTestGuildId();
        const userId = createTestUserId();
        const channelId = createTestChannelId();
        const roleId = createTestRoleId();

        const ids = [guildId, userId, channelId, roleId];
        const uniqueIds = new Set(ids);

        expect(uniqueIds.size).toBe(4);
      });
    });
  });

  describe('assertion helpers', () => {
    describe('assertValidGuildId', () => {
      describe('when value is valid', () => {
        it('should not throw for a valid GuildId', () => {
          // WHY: Valid IDs must pass assertion without error
          const guildId = createTestGuildId();

          expect(() => assertValidGuildId(guildId)).not.toThrow();
        });

        it('should not throw for a valid snowflake string', () => {
          // WHY: Valid snowflake strings should be assertable as GuildIds
          const validSnowflake = '123456789012345678';

          expect(() => assertValidGuildId(validSnowflake)).not.toThrow();
        });

        it('should narrow type after successful assertion', () => {
          // WHY: TypeScript should recognize the narrowed type after assertion
          const value: unknown = createTestGuildId();

          assertValidGuildId(value);

          // After assertion, TypeScript knows this is a GuildId
          const guildId: GuildId = value;
          expect(isGuildId(guildId)).toBe(true);
        });
      });

      describe('when value is invalid', () => {
        it('should throw for a string that is too short', () => {
          // WHY: Snowflakes must be 17-19 digits
          const tooShort = '1234567890123456'; // 16 digits

          expect(() => assertValidGuildId(tooShort)).toThrow();
          expect(() => assertValidGuildId(tooShort)).toThrow(/Expected valid GuildId/);
        });

        it('should throw for a string that is too long', () => {
          // WHY: Snowflakes must be 17-19 digits
          const tooLong = '12345678901234567890'; // 20 digits

          expect(() => assertValidGuildId(tooLong)).toThrow();
          expect(() => assertValidGuildId(tooLong)).toThrow(/Expected valid GuildId/);
        });

        it('should throw for a non-numeric string', () => {
          // WHY: Snowflakes must be numeric
          const nonNumeric = 'abc123xyz';

          expect(() => assertValidGuildId(nonNumeric)).toThrow();
          expect(() => assertValidGuildId(nonNumeric)).toThrow(/Expected valid GuildId/);
        });

        it('should throw for an empty string', () => {
          // WHY: Empty strings are invalid snowflakes
          const empty = '';

          expect(() => assertValidGuildId(empty)).toThrow();
        });

        it('should throw for null', () => {
          // WHY: Null is not a valid GuildId
          expect(() => assertValidGuildId(null)).toThrow();
        });

        it('should throw for undefined', () => {
          // WHY: Undefined is not a valid GuildId
          expect(() => assertValidGuildId(undefined)).toThrow();
        });

        it('should throw for a number instead of string', () => {
          // WHY: Even though snowflakes are numeric, they must be strings
          const number = 123456789012345678;

          expect(() => assertValidGuildId(number)).toThrow();
        });

        it('should throw for an object', () => {
          // WHY: Objects are not valid GuildIds
          const obj = { id: '123456789012345678' };

          expect(() => assertValidGuildId(obj)).toThrow();
        });

        it('should include the invalid value in error message', () => {
          // WHY: Error messages should help debug what went wrong
          const invalid = 'invalid-id';

          try {
            assertValidGuildId(invalid);
            expect.fail('Should have thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('invalid-id');
          }
        });
      });

      describe('type safety with wrong branded type', () => {
        it('should accept UserId at runtime since underlying format is same', () => {
          // WHY: At runtime, all Discord IDs have the same format
          // The branding is compile-time only
          const userId = createTestUserId();

          // This passes at runtime because the format is identical
          expect(() => assertValidGuildId(userId)).not.toThrow();
        });

        it('should demonstrate compile-time type safety prevents wrong branded types', () => {
          // WHY: This test documents that TypeScript prevents accidental type mixing
          // The following would be a compile error if uncommented:
          // const userId: UserId = createTestUserId();
          // const guildId: GuildId = userId; // Type error!

          // At runtime, we can only verify format, not brand
          const userId = createTestUserId();
          expect(() => assertValidGuildId(userId)).not.toThrow();
        });
      });
    });

    describe('assertValidUserId', () => {
      it('should not throw for a valid UserId', () => {
        const userId = createTestUserId();
        expect(() => assertValidUserId(userId)).not.toThrow();
      });

      it('should throw for an invalid string', () => {
        const invalid = 'not-a-user-id';
        expect(() => assertValidUserId(invalid)).toThrow(/Expected valid UserId/);
      });
    });

    describe('assertValidChannelId', () => {
      it('should not throw for a valid ChannelId', () => {
        const channelId = createTestChannelId();
        expect(() => assertValidChannelId(channelId)).not.toThrow();
      });

      it('should throw for an invalid string', () => {
        const invalid = '123';
        expect(() => assertValidChannelId(invalid)).toThrow(/Expected valid ChannelId/);
      });
    });

    describe('assertValidRoleId', () => {
      it('should not throw for a valid RoleId', () => {
        const roleId = createTestRoleId();
        expect(() => assertValidRoleId(roleId)).not.toThrow();
      });

      it('should throw for an invalid string', () => {
        const invalid = '';
        expect(() => assertValidRoleId(invalid)).toThrow(/Expected valid RoleId/);
      });
    });
  });

  describe('backward compatibility of fixtures', () => {
    describe('createMockGuildSettings compatibility', () => {
      it('should work without arguments', () => {
        // WHY: Existing tests may call createMockGuildSettings() without args
        const settings = createMockGuildSettings();

        expect(settings).toBeDefined();
        expect(settings.guildId).toBeDefined();
        expect(typeof settings.guildId).toBe('string');
      });

      it('should work with plain string guildId override', () => {
        // WHY: Existing tests may pass plain strings before branded types were introduced
        const plainStringId = '999888777666555444';
        const settings = createMockGuildSettings({ guildId: plainStringId });

        expect(settings.guildId).toBe(plainStringId);
      });

      it('should work with branded GuildId override', () => {
        // WHY: New tests should be able to use branded types
        const brandedId = createTestGuildId();
        const settings = createMockGuildSettings({ guildId: brandedId });

        expect(settings.guildId).toBe(brandedId);
        // Verify it's still a valid snowflake string
        expect(settings.guildId).toMatch(/^\d{17,19}$/);
      });

      it('should preserve all other fields when overriding guildId', () => {
        // WHY: Overriding one field should not affect others
        const brandedId = createTestGuildId();
        const settings = createMockGuildSettings({ guildId: brandedId });

        expect(settings.enabled).toBeDefined();
        expect(settings.afkTimeoutSeconds).toBeDefined();
        expect(settings.warningSecondsBefore).toBeDefined();
        expect(settings.exemptRoleIds).toBeDefined();
        expect(settings.adminRoleIds).toBeDefined();
      });

      it('should handle multiple overrides including branded guildId', () => {
        // WHY: Real-world tests often customize multiple fields
        const brandedId = createTestGuildId();
        const settings = createMockGuildSettings({
          guildId: brandedId,
          enabled: true,
          afkTimeoutSeconds: 600,
        });

        expect(settings.guildId).toBe(brandedId);
        expect(settings.enabled).toBe(true);
        expect(settings.afkTimeoutSeconds).toBe(600);
      });
    });

    describe('preset configurations', () => {
      it('should have valid ENABLED_CONFIG', () => {
        // WHY: Preset configs are used across many tests
        expect(ENABLED_CONFIG).toBeDefined();
        expect(ENABLED_CONFIG.enabled).toBe(true);
        expect(ENABLED_CONFIG.guildId).toMatch(/^\d+$/);
      });

      it('should have valid DISABLED_CONFIG', () => {
        // WHY: Preset configs are used across many tests
        expect(DISABLED_CONFIG).toBeDefined();
        expect(DISABLED_CONFIG.enabled).toBe(false);
        expect(DISABLED_CONFIG.guildId).toMatch(/^\d+$/);
      });

      it('should have ENABLED_CONFIG with realistic timeout values', () => {
        // WHY: Config values must pass validation logic
        expect(ENABLED_CONFIG.afkTimeoutSeconds).toBeGreaterThan(0);
        expect(ENABLED_CONFIG.warningSecondsBefore).toBeGreaterThan(0);
        expect(ENABLED_CONFIG.warningSecondsBefore).toBeLessThan(
          ENABLED_CONFIG.afkTimeoutSeconds
        );
      });

      it('should have DISABLED_CONFIG with realistic timeout values', () => {
        // WHY: Even disabled configs should have valid values
        expect(DISABLED_CONFIG.afkTimeoutSeconds).toBeGreaterThan(0);
        expect(DISABLED_CONFIG.warningSecondsBefore).toBeGreaterThan(0);
        expect(DISABLED_CONFIG.warningSecondsBefore).toBeLessThan(
          DISABLED_CONFIG.afkTimeoutSeconds
        );
      });
    });
  });

  describe('type safety verification', () => {
    it('should allow branded types to be used in type-safe code', () => {
      // WHY: Compile-time verification that our branded types work correctly
      const guildId: GuildId = createTestGuildId();
      const userId: UserId = createTestUserId();
      const channelId: ChannelId = createTestChannelId();
      const roleId: RoleId = createTestRoleId();

      // These should all be defined and strings
      expect(typeof guildId).toBe('string');
      expect(typeof userId).toBe('string');
      expect(typeof channelId).toBe('string');
      expect(typeof roleId).toBe('string');
    });

    it('should prevent accidental assignment between different ID types at compile time', () => {
      // WHY: The whole point of branded types is compile-time safety
      // This test documents expected behavior. The following would be compile errors:
      //
      // const guildId: GuildId = createTestUserId(); // Error!
      // const userId: UserId = createTestChannelId(); // Error!
      // const channelId: ChannelId = createTestRoleId(); // Error!

      // At runtime, we can only verify that they're valid
      const guildId = createTestGuildId();
      const userId = createTestUserId();

      expect(isGuildId(guildId)).toBe(true);
      expect(isUserId(userId)).toBe(true);
    });

    it('should allow branded types to be used where strings are expected', () => {
      // WHY: Branded types are assignable to strings (but not vice versa)
      const guildId: GuildId = createTestGuildId();
      const asString: string = guildId;

      expect(asString).toBe(guildId);
    });

    it('should demonstrate that assertion helpers provide type narrowing', () => {
      // WHY: Assertion helpers should work with TypeScript's type system
      const value: unknown = '123456789012345678';

      // Before assertion, TypeScript doesn't know the type
      // value.length; // Would be a compile error

      assertValidGuildId(value);

      // After assertion, TypeScript knows it's a GuildId
      const guildId: GuildId = value;
      expect(typeof guildId).toBe('string');
    });

    it('should verify factories return the correct branded types', () => {
      // WHY: Factory functions must return properly branded types, not just strings
      const guildId = createTestGuildId();
      const userId = createTestUserId();
      const channelId = createTestChannelId();
      const roleId = createTestRoleId();

      // Type assertions verify compile-time types match runtime behavior
      assertValidGuildId(guildId);
      assertValidUserId(userId);
      assertValidChannelId(channelId);
      assertValidRoleId(roleId);
    });
  });

  describe('array helper functions', () => {
    describe('createTestGuildIds', () => {
      it('should create the specified number of guild IDs', () => {
        // WHY: Tests need to create multiple entities efficiently
        const guildIds = createTestGuildIds(5);

        expect(guildIds).toHaveLength(5);
      });

      it('should create all unique guild IDs', () => {
        // WHY: Multiple guilds must have distinct IDs
        const guildIds = createTestGuildIds(10);
        const uniqueIds = new Set(guildIds);

        expect(uniqueIds.size).toBe(10);
      });

      it('should create valid GuildId branded types', () => {
        // WHY: All generated IDs must be properly branded
        const guildIds = createTestGuildIds(3);

        guildIds.forEach(guildId => {
          expect(() => assertValidGuildId(guildId)).not.toThrow();
        });
      });

      it('should handle creating zero IDs', () => {
        // WHY: Edge case - empty array should be valid
        const guildIds = createTestGuildIds(0);

        expect(guildIds).toHaveLength(0);
        expect(Array.isArray(guildIds)).toBe(true);
      });

      it('should handle creating one ID', () => {
        // WHY: Edge case - single element array
        const guildIds = createTestGuildIds(1);

        expect(guildIds).toHaveLength(1);
        expect(isGuildId(guildIds[0])).toBe(true);
      });

      it('should handle creating large numbers of IDs', () => {
        // WHY: Performance and uniqueness test
        const guildIds = createTestGuildIds(100);
        const uniqueIds = new Set(guildIds);

        expect(guildIds).toHaveLength(100);
        expect(uniqueIds.size).toBe(100);
      });
    });

    describe('createTestUserIds', () => {
      it('should create the specified number of user IDs', () => {
        // WHY: Tests need to simulate multiple users
        const userIds = createTestUserIds(3);

        expect(userIds).toHaveLength(3);
      });

      it('should create all unique user IDs', () => {
        // WHY: Multiple users must have distinct IDs
        const userIds = createTestUserIds(20);
        const uniqueIds = new Set(userIds);

        expect(uniqueIds.size).toBe(20);
      });

      it('should create valid UserId branded types', () => {
        // WHY: All generated IDs must be properly branded
        const userIds = createTestUserIds(5);

        userIds.forEach(userId => {
          expect(() => assertValidUserId(userId)).not.toThrow();
        });
      });

      it('should handle creating zero IDs', () => {
        // WHY: Edge case verification
        const userIds = createTestUserIds(0);

        expect(userIds).toHaveLength(0);
      });
    });

    describe('createTestChannelIds', () => {
      it('should create the specified number of channel IDs', () => {
        // WHY: Tests need to simulate multiple channels
        const channelIds = createTestChannelIds(4);

        expect(channelIds).toHaveLength(4);
      });

      it('should create all unique channel IDs', () => {
        // WHY: Multiple channels must have distinct IDs
        const channelIds = createTestChannelIds(15);
        const uniqueIds = new Set(channelIds);

        expect(uniqueIds.size).toBe(15);
      });

      it('should create valid ChannelId branded types', () => {
        // WHY: All generated IDs must be properly branded
        const channelIds = createTestChannelIds(7);

        channelIds.forEach(channelId => {
          expect(() => assertValidChannelId(channelId)).not.toThrow();
        });
      });

      it('should handle creating zero IDs', () => {
        // WHY: Edge case verification
        const channelIds = createTestChannelIds(0);

        expect(channelIds).toHaveLength(0);
      });
    });

    describe('createTestRoleIds', () => {
      it('should create the specified number of role IDs', () => {
        // WHY: Tests need to simulate multiple roles
        const roleIds = createTestRoleIds(6);

        expect(roleIds).toHaveLength(6);
      });

      it('should create all unique role IDs', () => {
        // WHY: Multiple roles must have distinct IDs
        const roleIds = createTestRoleIds(25);
        const uniqueIds = new Set(roleIds);

        expect(uniqueIds.size).toBe(25);
      });

      it('should create valid RoleId branded types', () => {
        // WHY: All generated IDs must be properly branded
        const roleIds = createTestRoleIds(8);

        roleIds.forEach(roleId => {
          expect(() => assertValidRoleId(roleId)).not.toThrow();
        });
      });

      it('should handle creating zero IDs', () => {
        // WHY: Edge case verification
        const roleIds = createTestRoleIds(0);

        expect(roleIds).toHaveLength(0);
      });
    });

    describe('cross-array uniqueness', () => {
      it('should maintain uniqueness across different array helper calls', () => {
        // WHY: IDs from different helpers should never collide
        const guildIds = createTestGuildIds(5);
        const userIds = createTestUserIds(5);
        const channelIds = createTestChannelIds(5);
        const roleIds = createTestRoleIds(5);

        const allIds = [...guildIds, ...userIds, ...channelIds, ...roleIds];
        const uniqueIds = new Set(allIds);

        expect(uniqueIds.size).toBe(20);
      });

      it('should maintain uniqueness when mixing array and single-value helpers', () => {
        // WHY: Tests may mix different helper styles
        const arrayGuildIds = createTestGuildIds(3);
        const singleGuildIds = [createTestGuildId(), createTestGuildId()];

        const allIds = [...arrayGuildIds, ...singleGuildIds];
        const uniqueIds = new Set(allIds);

        expect(uniqueIds.size).toBe(5);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should support creating a complete test guild with all ID types', () => {
      // WHY: Real tests often need multiple related entities
      const guildId = createTestGuildId();
      const channelId = createTestChannelId();
      const userId1 = createTestUserId();
      const userId2 = createTestUserId();
      const roleId = createTestRoleId();

      const settings = createMockGuildSettings({
        guildId,
        warningChannelId: channelId,
        exemptRoleIds: [roleId],
      });

      expect(settings.guildId).toBe(guildId);
      expect(settings.warningChannelId).toBe(channelId);
      expect(settings.exemptRoleIds).toContain(roleId);
      expect(userId1).not.toBe(userId2);
    });

    it('should maintain uniqueness across mixed factory calls', () => {
      // WHY: Tests with many entities must not have ID collisions
      const ids: string[] = [
        createTestGuildId(),
        createTestUserId(),
        createTestChannelId(),
        createTestRoleId(),
        createTestGuildId(),
        createTestUserId(),
        createTestChannelId(),
        createTestRoleId(),
      ];

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should support resetting counter for deterministic test ordering', () => {
      // WHY: Some test suites may need predictable ID generation
      resetSnowflakeCounter();
      const firstBatch = [
        createTestSnowflake(),
        createTestSnowflake(),
        createTestSnowflake(),
      ];

      resetSnowflakeCounter();
      const secondBatch = [
        createTestSnowflake(),
        createTestSnowflake(),
        createTestSnowflake(),
      ];

      // After reset, generation starts over
      expect(firstBatch[0]).toBe(secondBatch[0]);
      expect(firstBatch[1]).toBe(secondBatch[1]);
      expect(firstBatch[2]).toBe(secondBatch[2]);
    });

    it('should support using array helpers to create multiple entities efficiently', () => {
      // WHY: Array helpers simplify test setup for scenarios with many entities
      const guildIds = createTestGuildIds(3);
      const userIds = createTestUserIds(10);
      const exemptRoleIds = createTestRoleIds(2);

      // Verify we can use these in realistic test scenarios
      const settings = createMockGuildSettings({
        guildId: guildIds[0],
        exemptRoleIds,
      });

      expect(settings.guildId).toBe(guildIds[0]);
      expect(settings.exemptRoleIds).toHaveLength(2);
      expect(userIds).toHaveLength(10);
    });
  });
});
