/**
 * Formats an unknown error value into a structured object for logging.
 *
 * This utility handles the various types of values that can be thrown in JavaScript:
 * - Error objects with message and stack
 * - Plain strings
 * - Objects without proper Error prototype
 * - Primitive values (numbers, booleans, etc.)
 *
 * @param error - The error value to format (can be any thrown value)
 * @returns A structured object with message and optional stack trace
 *
 * @example
 * ```ts
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logger.error({ ...formatError(error), context }, 'Operation failed');
 * }
 * ```
 */
export function formatError(error: unknown): { message: string; stack?: string } {
  // Handle Error objects (most common case)
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error,
    };
  }

  // Handle objects with message property
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return {
      message: error.message,
      stack: 'stack' in error && typeof error.stack === 'string' ? error.stack : undefined,
    };
  }

  // Handle all other cases (primitives, null, undefined, objects without message)
  return {
    message: String(error),
  };
}
