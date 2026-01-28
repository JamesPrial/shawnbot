import { describe, it, expect } from 'vitest';
import {
  GuildId,
  UserId,
  ChannelId,
  RoleId,
  isGuildId,
  isUserId,
  isChannelId,
  isRoleId,
  asGuildId,
  asUserId,
  asChannelId,
  asRoleId,
  toGuildId,
  toUserId,
  toChannelId,
  toRoleId,
} from '../types/ids.js';

/**
 * Test suite for Discord ID branded types
 *
 * Discord snowflakes are 64-bit integers represented as strings.
 * Valid snowflakes are 17-19 digits long (as of 2026).
 *
 * These tests verify:
 * 1. Valid snowflakes are accepted
 * 2. Invalid inputs are rejected with clear boundaries
 * 3. Type guards correctly validate and narrow types
 * 4. Factory functions have predictable success/failure modes
 * 5. Different branded types are not interchangeable (compile-time safety)
 */

describe('Discord ID Branded Types', () => {
  describe('Valid snowflake acceptance', () => {
    describe('GuildId', () => {
      it('should accept 17-digit numeric strings', () => {
        const validSnowflake = '12345678901234567'; // 17 digits
        const guildId = asGuildId(validSnowflake);
        expect(guildId).toBe(validSnowflake);
        expect(isGuildId(guildId)).toBe(true);
      });

      it('should accept 18-digit numeric strings', () => {
        const validSnowflake = '123456789012345678'; // 18 digits
        const guildId = asGuildId(validSnowflake);
        expect(guildId).toBe(validSnowflake);
        expect(isGuildId(guildId)).toBe(true);
      });

      it('should accept 19-digit numeric strings', () => {
        const validSnowflake = '1234567890123456789'; // 19 digits
        const guildId = asGuildId(validSnowflake);
        expect(guildId).toBe(validSnowflake);
        expect(isGuildId(guildId)).toBe(true);
      });

      it('should accept real Discord guild snowflakes', () => {
        // Real Discord guild ID from documentation
        const realGuildId = '197038439483310086';
        const guildId = asGuildId(realGuildId);
        expect(guildId).toBe(realGuildId);
        expect(isGuildId(guildId)).toBe(true);
      });
    });

    describe('UserId', () => {
      it('should accept 17-digit numeric strings', () => {
        const validSnowflake = '98765432109876543'; // 17 digits
        const userId = asUserId(validSnowflake);
        expect(userId).toBe(validSnowflake);
        expect(isUserId(userId)).toBe(true);
      });

      it('should accept 18-digit numeric strings', () => {
        const validSnowflake = '987654321098765432'; // 18 digits
        const userId = asUserId(validSnowflake);
        expect(userId).toBe(validSnowflake);
        expect(isUserId(userId)).toBe(true);
      });

      it('should accept 19-digit numeric strings', () => {
        const validSnowflake = '9876543210987654321'; // 19 digits
        const userId = asUserId(validSnowflake);
        expect(userId).toBe(validSnowflake);
        expect(isUserId(userId)).toBe(true);
      });
    });

    describe('ChannelId', () => {
      it('should accept 17-digit numeric strings', () => {
        const validSnowflake = '55555555555555555'; // 17 digits
        const channelId = asChannelId(validSnowflake);
        expect(channelId).toBe(validSnowflake);
        expect(isChannelId(channelId)).toBe(true);
      });

      it('should accept 18-digit numeric strings', () => {
        const validSnowflake = '555555555555555555'; // 18 digits
        const channelId = asChannelId(validSnowflake);
        expect(channelId).toBe(validSnowflake);
        expect(isChannelId(channelId)).toBe(true);
      });

      it('should accept 19-digit numeric strings', () => {
        const validSnowflake = '5555555555555555555'; // 19 digits
        const channelId = asChannelId(validSnowflake);
        expect(channelId).toBe(validSnowflake);
        expect(isChannelId(channelId)).toBe(true);
      });
    });

    describe('RoleId', () => {
      it('should accept 17-digit numeric strings', () => {
        const validSnowflake = '44444444444444444'; // 17 digits
        const roleId = asRoleId(validSnowflake);
        expect(roleId).toBe(validSnowflake);
        expect(isRoleId(roleId)).toBe(true);
      });

      it('should accept 18-digit numeric strings', () => {
        const validSnowflake = '444444444444444444'; // 18 digits
        const roleId = asRoleId(validSnowflake);
        expect(roleId).toBe(validSnowflake);
        expect(isRoleId(roleId)).toBe(true);
      });

      it('should accept 19-digit numeric strings', () => {
        const validSnowflake = '4444444444444444444'; // 19 digits
        const roleId = asRoleId(validSnowflake);
        expect(roleId).toBe(validSnowflake);
        expect(isRoleId(roleId)).toBe(true);
      });
    });
  });

  describe('Invalid input rejection', () => {
    describe('Empty and whitespace strings', () => {
      it('should reject empty string for GuildId', () => {
        expect(() => asGuildId('')).toThrow();
        expect(isGuildId('')).toBe(false);
        expect(toGuildId('')).toBeNull();
      });

      it('should reject whitespace-only string for GuildId', () => {
        expect(() => asGuildId('   ')).toThrow();
        expect(isGuildId('   ')).toBe(false);
        expect(toGuildId('   ')).toBeNull();
      });

      it('should reject empty string for UserId', () => {
        expect(() => asUserId('')).toThrow();
        expect(isUserId('')).toBe(false);
        expect(toUserId('')).toBeNull();
      });

      it('should reject empty string for ChannelId', () => {
        expect(() => asChannelId('')).toThrow();
        expect(isChannelId('')).toBe(false);
        expect(toChannelId('')).toBeNull();
      });

      it('should reject empty string for RoleId', () => {
        expect(() => asRoleId('')).toThrow();
        expect(isRoleId('')).toBe(false);
        expect(toRoleId('')).toBeNull();
      });
    });

    describe('Non-numeric strings', () => {
      it('should reject alphabetic strings', () => {
        const invalid = 'not-a-number';
        expect(() => asGuildId(invalid)).toThrow();
        expect(isGuildId(invalid)).toBe(false);
        expect(toGuildId(invalid)).toBeNull();
      });

      it('should reject strings with special characters', () => {
        const invalid = '@#$%^&*()';
        expect(() => asGuildId(invalid)).toThrow();
        expect(isGuildId(invalid)).toBe(false);
        expect(toGuildId(invalid)).toBeNull();
      });

      it('should reject UUID format strings', () => {
        const invalid = '550e8400-e29b-41d4-a716-446655440000';
        expect(() => asGuildId(invalid)).toThrow();
        expect(isGuildId(invalid)).toBe(false);
        expect(toGuildId(invalid)).toBeNull();
      });
    });

    describe('Boundary violations - too short', () => {
      it('should reject 16-digit strings (below minimum)', () => {
        const tooShort = '1234567890123456'; // 16 digits
        expect(() => asGuildId(tooShort)).toThrow();
        expect(isGuildId(tooShort)).toBe(false);
        expect(toGuildId(tooShort)).toBeNull();
      });

      it('should reject single digit strings', () => {
        const tooShort = '1';
        expect(() => asGuildId(tooShort)).toThrow();
        expect(isGuildId(tooShort)).toBe(false);
        expect(toGuildId(tooShort)).toBeNull();
      });

      it('should reject 10-digit strings', () => {
        const tooShort = '1234567890';
        expect(() => asGuildId(tooShort)).toThrow();
        expect(isGuildId(tooShort)).toBe(false);
        expect(toGuildId(tooShort)).toBeNull();
      });
    });

    describe('Boundary violations - too long', () => {
      it('should reject 20-digit strings (above maximum)', () => {
        const tooLong = '12345678901234567890'; // 20 digits
        expect(() => asGuildId(tooLong)).toThrow();
        expect(isGuildId(tooLong)).toBe(false);
        expect(toGuildId(tooLong)).toBeNull();
      });

      it('should reject 25-digit strings', () => {
        const tooLong = '1234567890123456789012345'; // 25 digits
        expect(() => asGuildId(tooLong)).toThrow();
        expect(isGuildId(tooLong)).toBe(false);
        expect(toGuildId(tooLong)).toBeNull();
      });
    });

    describe('Mixed content - digits with non-digits', () => {
      it('should reject numbers with trailing letters', () => {
        const invalid = '1234567890123456a'; // 16 digits + letter
        expect(() => asGuildId(invalid)).toThrow();
        expect(isGuildId(invalid)).toBe(false);
        expect(toGuildId(invalid)).toBeNull();
      });

      it('should reject numbers with leading letters', () => {
        const invalid = 'a234567890123456789'; // letter + 18 digits
        expect(() => asGuildId(invalid)).toThrow();
        expect(isGuildId(invalid)).toBe(false);
        expect(toGuildId(invalid)).toBeNull();
      });

      it('should reject numbers with embedded letters', () => {
        const invalid = '12345678a0123456789'; // 8 digits + letter + 10 digits = 19 chars
        expect(() => asGuildId(invalid)).toThrow();
        expect(isGuildId(invalid)).toBe(false);
        expect(toGuildId(invalid)).toBeNull();
      });

      it('should reject numbers with hyphens', () => {
        const invalid = '123456789-123456789'; // digits with hyphen
        expect(() => asGuildId(invalid)).toThrow();
        expect(isGuildId(invalid)).toBe(false);
        expect(toGuildId(invalid)).toBeNull();
      });

      it('should reject numbers with spaces', () => {
        const invalid = '123456789 012345678'; // digits with space
        expect(() => asGuildId(invalid)).toThrow();
        expect(isGuildId(invalid)).toBe(false);
        expect(toGuildId(invalid)).toBeNull();
      });
    });

    describe('Edge cases with leading zeros', () => {
      it('should accept 17-digit strings with leading zeros', () => {
        // Leading zeros are valid in snowflakes (though rare in practice)
        const withLeadingZeros = '00345678901234567'; // 17 digits
        const guildId = asGuildId(withLeadingZeros);
        expect(guildId).toBe(withLeadingZeros);
        expect(isGuildId(guildId)).toBe(true);
      });

      it('should accept 18-digit strings with leading zeros', () => {
        const withLeadingZeros = '001456789012345678'; // 18 digits
        const guildId = asGuildId(withLeadingZeros);
        expect(guildId).toBe(withLeadingZeros);
        expect(isGuildId(guildId)).toBe(true);
      });
    });
  });

  describe('Type guard correctness', () => {
    describe('isGuildId', () => {
      it('should return true for valid GuildId branded type', () => {
        const guildId: GuildId = asGuildId('12345678901234567');
        expect(isGuildId(guildId)).toBe(true);
      });

      it('should return false for invalid strings', () => {
        expect(isGuildId('invalid')).toBe(false);
        expect(isGuildId('123')).toBe(false);
        expect(isGuildId('')).toBe(false);
      });

      it('should return false for strings of correct length but non-numeric', () => {
        const invalid = 'abcdefghijklmnopq'; // 17 chars but not digits
        expect(isGuildId(invalid)).toBe(false);
      });

      it('should narrow type correctly in conditional blocks', () => {
        const maybeGuildId: string = '12345678901234567';

        if (isGuildId(maybeGuildId)) {
          // TypeScript should infer maybeGuildId as GuildId here
          const typed: GuildId = maybeGuildId;
          expect(typed).toBe(maybeGuildId);
        } else {
          // Should not reach here
          expect.fail('Type guard should have returned true');
        }
      });
    });

    describe('isUserId', () => {
      it('should return true for valid UserId branded type', () => {
        const userId: UserId = asUserId('98765432109876543');
        expect(isUserId(userId)).toBe(true);
      });

      it('should return false for invalid strings', () => {
        expect(isUserId('invalid')).toBe(false);
        expect(isUserId('123')).toBe(false);
        expect(isUserId('')).toBe(false);
      });

      it('should narrow type correctly in conditional blocks', () => {
        const maybeUserId: string = '98765432109876543';

        if (isUserId(maybeUserId)) {
          const typed: UserId = maybeUserId;
          expect(typed).toBe(maybeUserId);
        } else {
          expect.fail('Type guard should have returned true');
        }
      });
    });

    describe('isChannelId', () => {
      it('should return true for valid ChannelId branded type', () => {
        const channelId: ChannelId = asChannelId('55555555555555555');
        expect(isChannelId(channelId)).toBe(true);
      });

      it('should return false for invalid strings', () => {
        expect(isChannelId('invalid')).toBe(false);
        expect(isChannelId('123')).toBe(false);
        expect(isChannelId('')).toBe(false);
      });

      it('should narrow type correctly in conditional blocks', () => {
        const maybeChannelId: string = '55555555555555555';

        if (isChannelId(maybeChannelId)) {
          const typed: ChannelId = maybeChannelId;
          expect(typed).toBe(maybeChannelId);
        } else {
          expect.fail('Type guard should have returned true');
        }
      });
    });

    describe('isRoleId', () => {
      it('should return true for valid RoleId branded type', () => {
        const roleId: RoleId = asRoleId('44444444444444444');
        expect(isRoleId(roleId)).toBe(true);
      });

      it('should return false for invalid strings', () => {
        expect(isRoleId('invalid')).toBe(false);
        expect(isRoleId('123')).toBe(false);
        expect(isRoleId('')).toBe(false);
      });

      it('should narrow type correctly in conditional blocks', () => {
        const maybeRoleId: string = '44444444444444444';

        if (isRoleId(maybeRoleId)) {
          const typed: RoleId = maybeRoleId;
          expect(typed).toBe(maybeRoleId);
        } else {
          expect.fail('Type guard should have returned true');
        }
      });
    });

    describe('Cross-type validation', () => {
      it('should return true when checking GuildId with isGuildId', () => {
        const id: GuildId = asGuildId('12345678901234567');
        expect(isGuildId(id)).toBe(true);
      });

      it('should return true when checking UserId with isUserId', () => {
        const id: UserId = asUserId('98765432109876543');
        expect(isUserId(id)).toBe(true);
      });

      // Note: At runtime, all valid snowflakes of the same format will pass any type guard
      // because they're all just string brands. This is expected - the type safety is compile-time.
      it('should return true when checking valid snowflake with any type guard (runtime behavior)', () => {
        const validSnowflake = '12345678901234567';
        // All type guards check the same format, so all return true
        expect(isGuildId(validSnowflake)).toBe(true);
        expect(isUserId(validSnowflake)).toBe(true);
        expect(isChannelId(validSnowflake)).toBe(true);
      });
    });
  });

  describe('Factory function behavior - asXxx (throwing)', () => {
    describe('asGuildId', () => {
      it('should return GuildId for valid input', () => {
        const valid = '12345678901234567';
        const result = asGuildId(valid);
        expect(result).toBe(valid);
        // Type assertion to verify it's assignable to GuildId
        const typed: GuildId = result;
        expect(typed).toBe(valid);
      });

      it('should throw Error for invalid input', () => {
        expect(() => asGuildId('invalid')).toThrow(Error);
      });

      it('should throw with descriptive message for empty string', () => {
        expect(() => asGuildId('')).toThrow(/snowflake|invalid|guild/i);
      });

      it('should throw with descriptive message for too short', () => {
        expect(() => asGuildId('123')).toThrow(/snowflake|invalid|guild/i);
      });

      it('should throw with descriptive message for too long', () => {
        expect(() => asGuildId('12345678901234567890')).toThrow(/snowflake|invalid|guild/i);
      });

      it('should throw with descriptive message for non-numeric', () => {
        expect(() => asGuildId('abc')).toThrow(/snowflake|invalid|guild/i);
      });
    });

    describe('asUserId', () => {
      it('should return UserId for valid input', () => {
        const valid = '98765432109876543';
        const result = asUserId(valid);
        expect(result).toBe(valid);
        const typed: UserId = result;
        expect(typed).toBe(valid);
      });

      it('should throw Error for invalid input', () => {
        expect(() => asUserId('invalid')).toThrow(Error);
      });

      it('should throw with descriptive message for empty string', () => {
        expect(() => asUserId('')).toThrow(/snowflake|invalid|user/i);
      });

      it('should throw with descriptive message for too short', () => {
        expect(() => asUserId('123')).toThrow(/snowflake|invalid|user/i);
      });
    });

    describe('asChannelId', () => {
      it('should return ChannelId for valid input', () => {
        const valid = '55555555555555555';
        const result = asChannelId(valid);
        expect(result).toBe(valid);
        const typed: ChannelId = result;
        expect(typed).toBe(valid);
      });

      it('should throw Error for invalid input', () => {
        expect(() => asChannelId('invalid')).toThrow(Error);
      });

      it('should throw with descriptive message for empty string', () => {
        expect(() => asChannelId('')).toThrow(/snowflake|invalid|channel/i);
      });
    });

    describe('asRoleId', () => {
      it('should return RoleId for valid input', () => {
        const valid = '44444444444444444';
        const result = asRoleId(valid);
        expect(result).toBe(valid);
        const typed: RoleId = result;
        expect(typed).toBe(valid);
      });

      it('should throw Error for invalid input', () => {
        expect(() => asRoleId('invalid')).toThrow(Error);
      });

      it('should throw with descriptive message for empty string', () => {
        expect(() => asRoleId('')).toThrow(/snowflake|invalid|role/i);
      });

      it('should throw with descriptive message for too short', () => {
        expect(() => asRoleId('123')).toThrow(/snowflake|invalid|role/i);
      });

      it('should throw with descriptive message for too long', () => {
        expect(() => asRoleId('44444444444444444444')).toThrow(/snowflake|invalid|role/i);
      });

      it('should throw with descriptive message for non-numeric', () => {
        expect(() => asRoleId('abc')).toThrow(/snowflake|invalid|role/i);
      });
    });
  });

  describe('Factory function behavior - toXxx (nullable)', () => {
    describe('toGuildId', () => {
      it('should return GuildId for valid input', () => {
        const valid = '12345678901234567';
        const result = toGuildId(valid);
        expect(result).toBe(valid);
        expect(result).not.toBeNull();

        // Type guard to narrow from GuildId | null
        if (result !== null) {
          const typed: GuildId = result;
          expect(typed).toBe(valid);
        }
      });

      it('should return null for invalid input', () => {
        expect(toGuildId('invalid')).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(toGuildId('')).toBeNull();
      });

      it('should return null for too short string', () => {
        expect(toGuildId('123')).toBeNull();
      });

      it('should return null for too long string', () => {
        expect(toGuildId('12345678901234567890')).toBeNull();
      });

      it('should return null for non-numeric string', () => {
        expect(toGuildId('abc')).toBeNull();
      });

      it('should return null for mixed content', () => {
        expect(toGuildId('1234567890123456a')).toBeNull();
      });
    });

    describe('toUserId', () => {
      it('should return UserId for valid input', () => {
        const valid = '98765432109876543';
        const result = toUserId(valid);
        expect(result).toBe(valid);
        expect(result).not.toBeNull();
      });

      it('should return null for invalid input', () => {
        expect(toUserId('invalid')).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(toUserId('')).toBeNull();
      });

      it('should return null for too short string', () => {
        expect(toUserId('123')).toBeNull();
      });

      it('should return null for too long string', () => {
        expect(toUserId('12345678901234567890')).toBeNull();
      });
    });

    describe('toChannelId', () => {
      it('should return ChannelId for valid input', () => {
        const valid = '55555555555555555';
        const result = toChannelId(valid);
        expect(result).toBe(valid);
        expect(result).not.toBeNull();
      });

      it('should return null for invalid input', () => {
        expect(toChannelId('invalid')).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(toChannelId('')).toBeNull();
      });

      it('should return null for too short string', () => {
        expect(toChannelId('123')).toBeNull();
      });
    });

    describe('toRoleId', () => {
      it('should return RoleId for valid input', () => {
        const valid = '44444444444444444';
        const result = toRoleId(valid);
        expect(result).toBe(valid);
        expect(result).not.toBeNull();

        // Type guard to narrow from RoleId | null
        if (result !== null) {
          const typed: RoleId = result;
          expect(typed).toBe(valid);
        }
      });

      it('should return null for invalid input', () => {
        expect(toRoleId('invalid')).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(toRoleId('')).toBeNull();
      });

      it('should return null for too short string', () => {
        expect(toRoleId('123')).toBeNull();
      });

      it('should return null for too long string', () => {
        expect(toRoleId('44444444444444444444')).toBeNull();
      });

      it('should return null for non-numeric string', () => {
        expect(toRoleId('abc')).toBeNull();
      });

      it('should return null for mixed content', () => {
        expect(toRoleId('4444444444444444a')).toBeNull();
      });
    });

    describe('Consistency between asXxx and toXxx', () => {
      it('should have toGuildId succeed when asGuildId would succeed', () => {
        const valid = '12345678901234567';
        const fromAs = asGuildId(valid);
        const fromTo = toGuildId(valid);
        expect(fromTo).toBe(fromAs);
        expect(fromTo).not.toBeNull();
      });

      it('should have toGuildId return null when asGuildId would throw', () => {
        const invalid = 'not-valid';
        expect(() => asGuildId(invalid)).toThrow();
        expect(toGuildId(invalid)).toBeNull();
      });

      it('should have toUserId succeed when asUserId would succeed', () => {
        const valid = '98765432109876543';
        const fromAs = asUserId(valid);
        const fromTo = toUserId(valid);
        expect(fromTo).toBe(fromAs);
        expect(fromTo).not.toBeNull();
      });

      it('should have toUserId return null when asUserId would throw', () => {
        const invalid = 'not-valid';
        expect(() => asUserId(invalid)).toThrow();
        expect(toUserId(invalid)).toBeNull();
      });
    });
  });

  describe('Type safety enforcement (compile-time checks)', () => {
    it('should allow assignment of valid snowflake to GuildId via factory', () => {
      const guildId: GuildId = asGuildId('12345678901234567');
      expect(guildId).toBe('12345678901234567');
    });

    it('should allow assignment of valid snowflake to UserId via factory', () => {
      const userId: UserId = asUserId('98765432109876543');
      expect(userId).toBe('98765432109876543');
    });

    it('should allow assignment of valid snowflake to ChannelId via factory', () => {
      const channelId: ChannelId = asChannelId('55555555555555555');
      expect(channelId).toBe('55555555555555555');
    });

    it('should allow assignment of valid snowflake to RoleId via factory', () => {
      const roleId: RoleId = asRoleId('44444444444444444');
      expect(roleId).toBe('44444444444444444');
    });

    // Note: The following tests verify compile-time type safety.
    // TypeScript will prevent the following code from compiling if the types are correctly branded.
    // We include these as documentation of the expected type behavior.

    it('should document that GuildId cannot be assigned to UserId (compile-time)', () => {
      const guildId: GuildId = asGuildId('12345678901234567');

      // This would be a compile error if uncommented:
      // const userId: UserId = guildId; // Type error: GuildId is not assignable to UserId

      // But at runtime, they're both strings, so we verify the value
      expect(guildId).toBe('12345678901234567');
    });

    it('should document that UserId cannot be assigned to GuildId (compile-time)', () => {
      const userId: UserId = asUserId('98765432109876543');

      // This would be a compile error if uncommented:
      // const guildId: GuildId = userId; // Type error: UserId is not assignable to GuildId

      expect(userId).toBe('98765432109876543');
    });

    it('should document that different branded types require explicit conversion', () => {
      const guildId: GuildId = asGuildId('12345678901234567');

      // To use a GuildId where a UserId is expected, you must explicitly convert:
      // const userId: UserId = asUserId(guildId); // This works because asUserId accepts string

      // But you cannot directly assign:
      // const userId: UserId = guildId; // Compile error

      expect(isGuildId(guildId)).toBe(true);
    });

    it('should allow branded types to be used as regular strings in operations', () => {
      const guildId: GuildId = asGuildId('12345678901234567');
      const userId: UserId = asUserId('98765432109876543');

      // Branded types can be concatenated, compared, etc. like strings
      const combined = `${guildId}:${userId}`;
      expect(combined).toBe('12345678901234567:98765432109876543');

      // String methods work
      expect(guildId.length).toBe(17);
      expect(userId.charAt(0)).toBe('9');
    });

    it('should allow branded types in Map keys', () => {
      const guildId1: GuildId = asGuildId('12345678901234567');
      const guildId2: GuildId = asGuildId('98765432109876543');

      const map = new Map<GuildId, string>();
      map.set(guildId1, 'Guild One');
      map.set(guildId2, 'Guild Two');

      expect(map.get(guildId1)).toBe('Guild One');
      expect(map.get(guildId2)).toBe('Guild Two');
      expect(map.size).toBe(2);
    });

    it('should allow branded types in Set', () => {
      const guildId1: GuildId = asGuildId('12345678901234567');
      const guildId2: GuildId = asGuildId('98765432109876543');

      const set = new Set<GuildId>();
      set.add(guildId1);
      set.add(guildId2);
      set.add(guildId1); // Duplicate

      expect(set.has(guildId1)).toBe(true);
      expect(set.has(guildId2)).toBe(true);
      expect(set.size).toBe(2); // Duplicate was not added
    });

    it('should allow branded types in Record keys', () => {
      const guildId: GuildId = asGuildId('12345678901234567');

      const record: Record<GuildId, string> = {
        [guildId]: 'Test Guild',
      };

      expect(record[guildId]).toBe('Test Guild');
    });
  });

  describe('Practical usage patterns', () => {
    it('should support safe conversion from unknown API responses', () => {
      // Simulating Discord API response
      const apiResponse = {
        guild_id: '12345678901234567',
        user_id: '98765432109876543',
        channel_id: '55555555555555555',
      };

      // Safe conversion with null checks
      const guildId = toGuildId(apiResponse.guild_id);
      const userId = toUserId(apiResponse.user_id);
      const channelId = toChannelId(apiResponse.channel_id);

      expect(guildId).not.toBeNull();
      expect(userId).not.toBeNull();
      expect(channelId).not.toBeNull();

      if (guildId !== null && userId !== null && channelId !== null) {
        // Now we have properly typed IDs
        const typed: {
          guild: GuildId;
          user: UserId;
          channel: ChannelId;
        } = {
          guild: guildId,
          user: userId,
          channel: channelId,
        };

        expect(typed.guild).toBe(apiResponse.guild_id);
        expect(typed.user).toBe(apiResponse.user_id);
        expect(typed.channel).toBe(apiResponse.channel_id);
      }
    });

    it('should support validation in function parameters', () => {
      // Function that requires a GuildId
      function getGuildName(guildId: GuildId): string {
        return `Guild_${guildId}`;
      }

      const validId = '12345678901234567';
      const guildId = asGuildId(validId);

      const result = getGuildName(guildId);
      expect(result).toBe('Guild_12345678901234567');
    });

    it('should support composite keys with multiple branded types', () => {
      const guildId: GuildId = asGuildId('12345678901234567');
      const userId: UserId = asUserId('98765432109876543');

      // Common pattern in the codebase: composite keys
      const compositeKey = `${guildId}:${userId}`;
      expect(compositeKey).toBe('12345678901234567:98765432109876543');

      // Parsing composite keys back
      const [guildPart, userPart] = compositeKey.split(':');
      const parsedGuild = toGuildId(guildPart);
      const parsedUser = toUserId(userPart);

      expect(parsedGuild).toBe(guildId);
      expect(parsedUser).toBe(userId);
    });

    it('should support filtering arrays of strings to branded types', () => {
      const mixedIds = [
        '12345678901234567', // Valid
        'invalid',
        '98765432109876543', // Valid
        '123', // Too short
        '11111111111111111', // Valid
      ];

      const validGuildIds: GuildId[] = mixedIds
        .map(toGuildId)
        .filter((id): id is GuildId => id !== null);

      expect(validGuildIds).toHaveLength(3);
      expect(validGuildIds[0]).toBe('12345678901234567');
      expect(validGuildIds[1]).toBe('98765432109876543');
      expect(validGuildIds[2]).toBe('11111111111111111');
    });
  });

  describe('Error messages and debugging', () => {
    it('should provide helpful error message for asGuildId with invalid format', () => {
      try {
        asGuildId('not-a-snowflake');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          // Error should mention what went wrong
          const message = error.message.toLowerCase();
          expect(
            message.includes('snowflake') ||
            message.includes('invalid') ||
            message.includes('guild')
          ).toBe(true);
        }
      }
    });

    it('should provide helpful error message for asUserId with invalid format', () => {
      try {
        asUserId('123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          expect(
            message.includes('snowflake') ||
            message.includes('invalid') ||
            message.includes('user')
          ).toBe(true);
        }
      }
    });

    it('should provide helpful error message for asChannelId with invalid format', () => {
      try {
        asChannelId('');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          expect(
            message.includes('snowflake') ||
            message.includes('invalid') ||
            message.includes('channel')
          ).toBe(true);
        }
      }
    });

    it('should provide helpful error message for asRoleId with invalid format', () => {
      try {
        asRoleId('not-a-snowflake');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          expect(
            message.includes('snowflake') ||
            message.includes('invalid') ||
            message.includes('role')
          ).toBe(true);
        }
      }
    });
  });
});
