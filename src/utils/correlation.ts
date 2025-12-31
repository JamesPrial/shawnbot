import { randomUUID } from 'crypto';

/**
 * Generates a short correlation ID for tracing events across service boundaries.
 * Uses first 8 characters of UUID for readability in logs.
 */
export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}
