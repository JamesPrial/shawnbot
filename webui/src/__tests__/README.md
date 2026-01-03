# Test Suite Documentation

## Overview

This directory contains tests for the ShawnBot WebUI admin interface. All tests use Vitest as the test runner and follow strict behavior-driven design principles.

## Running Tests

```bash
npm test                    # Watch mode
npm run test:run            # Run once
npm run test:run -- auth.test.ts  # Single file
```

## Test Files

### config.test.ts - Project Scaffolding Configuration Tests (WU-1)

**Purpose:** Validates that the build tooling and TypeScript configuration are set up correctly before any application code is written.

**Key Behaviors Tested:**

1. **Vite Configuration**
   - React plugin is properly configured
   - Development server proxy routes `/api` and `/health` to `http://127.0.0.1:3000`
   - Proxy settings use `changeOrigin: true` and `secure: false` for development
   - No extraneous proxy routes that would break the dev server

2. **TypeScript Configuration**
   - Strict mode enabled (catches type errors at compile time)
   - `noUncheckedIndexedAccess` enabled (forces explicit undefined checks for array/object indexing)
   - All strict linting options enabled (noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch)
   - React-specific settings (jsx: 'react-jsx', DOM types included)
   - Vite-compatible module settings (bundler resolution, ESNext modules, isolatedModules)

3. **Security Validations**
   - Proxy targets only use localhost (127.0.0.1) to match Admin API security model
   - All proxy configurations point to the same target (no misconfigurations)

4. **Edge Cases**
   - Verifies modern ECMAScript target (ES2020+)
   - Ensures DOM types are included for React
   - Validates that source file inclusion is configured correctly
   - Checks for TypeScript project references to node configuration

**Why These Tests Matter:**

A misconfigured build tool or TypeScript compiler causes subtle bugs that bypass the type system. These tests act as a specification - if someone deleted the configuration files, these tests would describe exactly how to rebuild them correctly.

**Critical Invariants:**
- The webui MUST match the parent bot's type safety standards (strict + noUncheckedIndexedAccess)
- Proxy routes MUST only target localhost for security
- The React plugin MUST be present for JSX transformation
- TypeScript MUST be configured for Vite's bundler mode

### auth.test.ts

Comprehensive tests for the authentication system covering:

**tokenStorage.ts tests:**
- Token retrieval when empty and when stored
- Token persistence in sessionStorage
- Token clearing and idempotency
- Edge cases: empty strings, special characters, long tokens
- Complete lifecycle integration (set → get → clear)

**AuthContext.tsx tests:**
- Initial authentication state (with/without stored tokens)
- Automatic token validation on component mount
- Login flow with valid tokens (state update, storage, API calls)
- Login flow with invalid tokens (rejection, no state change)
- Logout flow (state clearing, storage cleanup)
- Token validation with stored tokens (valid/invalid)
- Error handling (network errors, API failures)
- Edge cases: empty tokens, concurrent logins
- Complete auth cycles (login → logout → login)

**Key Testing Patterns:**

1. **sessionStorage Mocking**: Uses a custom mock with proper state isolation between tests
2. **API Mocking**: `vi.mock('../api/client')` with controlled success/failure responses
3. **React Testing**: Uses `@testing-library/react` with proper async handling via `waitFor` and `act`
4. **Test Components**: Small consumer components that exercise the AuthContext hooks

**Why These Tests Matter:**

The authentication system is the security boundary for the admin API. These tests prove:
- Unauthorized users cannot access admin functions
- Tokens are validated before granting access
- Invalid/expired tokens are cleaned up automatically
- The UI correctly reflects authentication state
- Session persistence works across page loads (via sessionStorage)

## Test Philosophy

Every test in this suite follows these principles:

1. **Behavior-Driven**: Tests specify WHAT the code should do, not HOW it does it
2. **Edge Case Coverage**: Boundary values, error paths, and race conditions are tested
3. **No Cheating**: Tests assert on specific values and will fail when code breaks
4. **Isolation**: Each test runs independently with fresh mocks and state
5. **Clear Intent**: Test names read as specifications, comments explain WHY tests exist

## Writing New Tests

When adding tests:

1. Start by identifying the CONTRACT: What guarantees does this code make?
2. Test the unhappy paths as thoroughly as happy paths
3. Use descriptive test names: `should reject emails without @ symbol`
4. Add comments explaining WHY for non-obvious edge cases
5. Ensure tests FAIL when the implementation is broken (mutation testing mindset)

## Mocking Strategy

- **Mock external dependencies**: API clients, sessionStorage
- **Never mock the unit under test**: Test the real implementation
- **Reset mocks between tests**: Use `beforeEach(() => vi.clearAllMocks())`
- **Verify mock interactions**: When side effects matter, assert on mock calls

## Coverage vs Correctness

Coverage is a side effect of good testing, never a goal. A test that exercises code without meaningful assertions provides false confidence. Focus on proving correctness.
