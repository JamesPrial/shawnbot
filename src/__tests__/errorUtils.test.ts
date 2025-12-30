import { describe, it, expect } from 'vitest';
import { formatError } from '../utils/errorUtils';

describe('formatError', () => {
  it('should format Error objects with message and stack', () => {
    const error = new Error('Test error');
    const result = formatError(error);

    expect(result.message).toBe('Test error');
    expect(result.stack).toBeDefined();
    expect(result.stack).toContain('Test error');
  });

  it('should format string errors', () => {
    const result = formatError('Something went wrong');

    expect(result).toEqual({
      message: 'Something went wrong',
    });
  });

  it('should format objects with message property', () => {
    const error = { message: 'Custom error', code: 500 };
    const result = formatError(error);

    expect(result.message).toBe('Custom error');
    expect(result.stack).toBeUndefined();
  });

  it('should format objects with message and stack properties', () => {
    const error = { message: 'Custom error', stack: 'at line 42' };
    const result = formatError(error);

    expect(result).toEqual({
      message: 'Custom error',
      stack: 'at line 42',
    });
  });

  it('should format primitive values', () => {
    expect(formatError(42)).toEqual({ message: '42' });
    expect(formatError(true)).toEqual({ message: 'true' });
    expect(formatError(null)).toEqual({ message: 'null' });
    expect(formatError(undefined)).toEqual({ message: 'undefined' });
  });

  it('should format objects without message property', () => {
    const error = { code: 500, details: 'Something failed' };
    const result = formatError(error);

    expect(result.message).toBe('[object Object]');
    expect(result.stack).toBeUndefined();
  });
});
