import { describe, it, expect } from 'vitest';
import { generateCorrelationId } from '../utils/correlation';

describe('generateCorrelationId', () => {
  describe('format guarantees', () => {
    it('should return an 8-character string', () => {
      const id = generateCorrelationId();
      expect(id).toHaveLength(8);
    });

    it('should return only valid hexadecimal characters', () => {
      // UUID v4 format uses lowercase hex: [0-9a-f]
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should never return an empty string', () => {
      // Verify the contract: this function always returns a valid ID
      for (let i = 0; i < 10; i++) {
        const id = generateCorrelationId();
        expect(id).toBeTruthy();
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('should return URL-safe characters', () => {
      // Hex characters are always URL-safe, but verify no special chars leak in
      const id = generateCorrelationId();
      const encoded = encodeURIComponent(id);
      expect(encoded).toBe(id); // Should not need encoding
    });
  });

  describe('uniqueness guarantees', () => {
    it('should return unique values on consecutive calls', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      const id3 = generateCorrelationId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should return unique values in rapid succession', () => {
      // Test for race conditions or timestamp-based collisions
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });

    it('should have extremely low collision probability in realistic usage', () => {
      // 1000 IDs is far more than a single bot instance would generate per second
      // With 8 hex chars (32 bits), collision probability is negligible
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('boundary conditions', () => {
    it('should handle first call without initialization errors', () => {
      // Verifies crypto.randomUUID is available and functional
      expect(() => generateCorrelationId()).not.toThrow();
    });

    it('should be stateless across calls', () => {
      // Each call should be independent, no internal state accumulation
      const firstBatch = Array.from({ length: 10 }, () => generateCorrelationId());
      const secondBatch = Array.from({ length: 10 }, () => generateCorrelationId());

      // All IDs should be unique across batches
      const allIds = new Set([...firstBatch, ...secondBatch]);
      expect(allIds.size).toBe(20);
    });
  });

  describe('format consistency', () => {
    it('should always slice from UUID prefix consistently', () => {
      // The implementation uses .slice(0, 8) on UUID
      // UUIDs always have format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // First 8 chars are always hex (before first dash at position 8)
      for (let i = 0; i < 50; i++) {
        const id = generateCorrelationId();
        expect(id).not.toContain('-'); // Should not include the dash at position 8
        expect(id).toHaveLength(8);
        expect(id).toMatch(/^[0-9a-f]{8}$/);
      }
    });

    it('should produce lowercase hexadecimal only', () => {
      // crypto.randomUUID() returns lowercase hex
      // Verify no uppercase leaks through
      for (let i = 0; i < 20; i++) {
        const id = generateCorrelationId();
        expect(id).toBe(id.toLowerCase());
        expect(id).not.toMatch(/[A-F]/); // No uppercase
        expect(id).not.toMatch(/[^0-9a-f]/); // Nothing but lowercase hex
      }
    });
  });

  describe('statistical properties', () => {
    it('should have roughly uniform character distribution', () => {
      // With enough samples, each hex char should appear
      // This tests that randomUUID is actually random, not biased
      const charCounts = new Map<string, number>();
      const sampleSize = 1000;

      for (let i = 0; i < sampleSize; i++) {
        const id = generateCorrelationId();
        for (const char of id) {
          charCounts.set(char, (charCounts.get(char) ?? 0) + 1);
        }
      }

      // With 8000 total chars (1000 IDs * 8 chars) and 16 possible values,
      // we expect ~500 of each char. Test that we see at least 12 of 16 possible chars.
      // (Statistical test, not deterministic, but would catch broken RNG)
      expect(charCounts.size).toBeGreaterThanOrEqual(12);
    });

    it('should not have sequential patterns', () => {
      // Verify IDs are not incrementing or following predictable patterns
      const ids = Array.from({ length: 10 }, () => generateCorrelationId());

      // Check that no two consecutive IDs differ by exactly 1 (would indicate counter)
      for (let i = 0; i < ids.length - 1; i++) {
        const current = parseInt(ids[i] ?? '', 16);
        const next = parseInt(ids[i + 1] ?? '', 16);
        expect(Math.abs(current - next)).not.toBe(1);
      }
    });
  });
});
