/**
 * Vitest Test Setup
 *
 * Global setup for all tests
 */

import '@testing-library/jest-dom';

// Polyfill TextEncoder for jsdom if not available
if (typeof global.TextEncoder === 'undefined') {
  try {
    // Try using Node.js util module
    const { TextEncoder, TextDecoder } = require('util');
    Object.assign(global, { TextEncoder, TextDecoder });
  } catch {
    // If that fails, create a minimal polyfill
    class TextEncoderPolyfill {
      encode(input: string): Uint8Array {
        const buffer = Buffer.from(input, 'utf-8');
        return new Uint8Array(buffer);
      }
    }
    global.TextEncoder = TextEncoderPolyfill;
  }
}
