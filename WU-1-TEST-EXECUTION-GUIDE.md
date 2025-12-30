# WU-1 Test Execution Guide

## How to Verify Runtime Behavior

This guide provides instructions for running the refactored tests and interpreting the results.

---

## Prerequisites

Ensure dependencies are installed:

```bash
cd /var/local/code/shawnbot
npm install
```

---

## Test Execution Commands

### Run Both Refactored Test Files

```bash
npm run test:run -- src/__tests__/schema.test.ts src/__tests__/RateLimiter.test.ts
```

### Run Individual Files

**Schema tests only:**
```bash
npm run test:run -- src/__tests__/schema.test.ts
```

**RateLimiter tests only:**
```bash
npm run test:run -- src/__tests__/RateLimiter.test.ts
```

### Alternative: Run All Tests

```bash
npm run test:run
```
(This runs the entire test suite, including the two refactored files)

---

## Expected Output

### Successful Execution

When tests pass, you should see output similar to:

```
✓ src/__tests__/schema.test.ts (21)
  ✓ schema (21)
    ✓ createTables (21)
      ✓ when database is valid (4)
        ✓ should create guild_settings table successfully
        ✓ should create table with correct columns
        ✓ should be idempotent (safe to call multiple times)
        ✓ should not log errors when successful
      ✓ when database.exec fails (8)
        ✓ should throw error with context when db.exec fails
        ✓ should log error before throwing
        ✓ should preserve the original error message in the thrown error
        ✓ should handle database connection errors
        ✓ should handle disk full errors
        ✓ should handle permission errors
        ✓ should handle syntax errors in SQL (if schema is modified incorrectly)
        ✓ should include the full error details in the log
      ✓ edge cases (3)
        ✓ should handle closed database gracefully
        ✓ should handle non-Error exceptions from db.exec
        ✓ should handle null/undefined thrown from db.exec
      ✓ integration scenarios (3)
        ✓ should allow inserting data after successful table creation
        ✓ should create table with correct default values
        ✓ should enforce primary key constraint

✓ src/__tests__/RateLimiter.test.ts (63)
  ✓ RateLimiter (63)
    ✓ constructor (5)
      ✓ should accept default configuration when no config provided
      ✓ should accept partial config override for windowMs
      ✓ should accept partial config override for warnThreshold
      ✓ should accept partial config override for crashThreshold
      ✓ should accept multiple config overrides simultaneously
    ✓ recordAction (12)
      ✓ warn threshold boundary testing (4)
        ✓ should not log warning at 19 actions (just below threshold)
        ✓ should log warning exactly at 20 actions (exactly at threshold)
        ✓ should continue logging warning at 21 actions (above threshold)
        ✓ should continue logging warnings from 21 to 49 actions without crashing
      ✓ crash threshold boundary testing (3)
        ✓ should not crash at 49 actions (just below crash threshold)
        ✓ should log error and call process.exit(1) exactly at 50 actions
        ✓ should not call process.exit more than once even if actions continue
      ✓ action counting accuracy (3)
        ✓ should accurately count single action
        ✓ should accurately count multiple actions
        ✓ should increment count by exactly 1 per action
    ✓ sliding window behavior (12)
      ... (remaining test descriptions)
    ✓ getActionCount (6)
    ✓ warning message content (3)
    ✓ error message content (2)
    ✓ multiple independent limiter instances (2)
    ✓ stress testing and edge cases (5)
    ✓ interaction between warn and crash thresholds (4)
    ✓ time manipulation edge cases (2)

Test Files  2 passed (2)
     Tests  84 passed (84)
  Start at  HH:MM:SS
  Duration  XXXms
```

### Success Indicators

- ✅ **Test Files:** `2 passed (2)`
- ✅ **Tests:** `84 passed (84)`
- ✅ **Failures:** `0`
- ✅ **Exit Code:** `0`

---

## Interpreting Results

### All Tests Pass (Expected)

```
Test Files  2 passed (2)
     Tests  84 passed (84)
```

**Meaning:** Refactoring is successful. All test behaviors preserved.

**Action:** ✅ Approve for merge.

---

### Some Tests Fail (Unexpected)

```
Test Files  1 failed | 1 passed (2)
     Tests  3 failed | 81 passed (84)
```

**Meaning:** Refactoring introduced behavioral changes (this should not happen).

**Action:**
1. Review failure details in output
2. Check if `createMockLogger()` is missing expected methods
3. Verify `child()` chaining behavior
4. Confirm fresh mock instances created in `beforeEach()`

---

## Common Failure Scenarios (Should Not Occur)

### Scenario 1: Missing Logger Method

**Error:**
```
TypeError: mockLogger.someMethod is not a function
```

**Cause:** MockLogger interface missing a method that tests expect.

**Fix:** Add missing method to MockLogger interface and createMockLogger() in fixtures.ts.

---

### Scenario 2: Mock Not Reset Between Tests

**Error:**
```
AssertionError: expected fn to not have been called
```

**Cause:** Mock state polluted from previous tests.

**Fix:** Verify `beforeEach()` calls `createMockLogger()` to create fresh instances.

---

### Scenario 3: child() Not Chaining

**Error:**
```
TypeError: Cannot read properties of undefined (reading 'info')
```

**Cause:** `child()` not returning logger instance.

**Fix:** Verify line 34 in fixtures.ts: `logger.child.mockReturnValue(logger)`

---

## Debugging Failed Tests

If tests fail unexpectedly, run with verbose output:

```bash
npm run test:run -- src/__tests__/schema.test.ts src/__tests__/RateLimiter.test.ts --reporter=verbose
```

Or run in watch mode for interactive debugging:

```bash
npm test -- src/__tests__/schema.test.ts src/__tests__/RateLimiter.test.ts
```

---

## Verification Checklist

After running tests, confirm:

- [ ] **84 total tests executed** (21 from schema.test.ts, 63 from RateLimiter.test.ts)
- [ ] **All tests passed** (0 failures)
- [ ] **Exit code 0** (command succeeded)
- [ ] **No error output** in console
- [ ] **Test duration reasonable** (< 5 seconds typical)

---

## Test Breakdown

### schema.test.ts (21 tests)

| Category | Test Count |
|----------|-----------|
| when database is valid | 4 |
| when database.exec fails | 8 |
| edge cases | 3 |
| integration scenarios | 3 |
| **Total** | **21** |

**Key behaviors tested:**
- Table creation success
- Column verification
- Idempotency
- Error handling (8 different error scenarios)
- Edge cases (closed db, non-Error exceptions)
- Integration (data insertion, defaults, constraints)

**Logger method usage:**
- `mockLogger.error` - Verified in all error handling tests

---

### RateLimiter.test.ts (63 tests)

| Category | Test Count |
|----------|-----------|
| constructor | 5 |
| recordAction (3 subcategories) | 12 |
| sliding window behavior (3 subcategories) | 12 |
| getActionCount | 6 |
| warning message content | 3 |
| error message content | 2 |
| multiple independent limiter instances | 2 |
| stress testing and edge cases | 5 |
| interaction between warn and crash thresholds | 4 |
| time manipulation edge cases | 2 |
| **Total** | **63** |

**Key behaviors tested:**
- Configuration handling (defaults, partial overrides)
- Threshold boundary testing (warn at 20, crash at 50)
- Sliding window pruning (60-second window)
- Action counting accuracy
- Message structure verification
- Instance independence
- Stress testing (large counts, small windows)
- Time manipulation (fake timers, clock skew)

**Logger method usage:**
- `mockLogger.warn` - Used 40+ times for warning threshold tests
- `mockLogger.error` - Used 15+ times for crash threshold tests

---

## Performance Expectations

**Typical execution time:**
- schema.test.ts: < 500ms
- RateLimiter.test.ts: < 2000ms
- Total: < 2500ms

**Why RateLimiter takes longer:**
- Uses fake timers extensively
- Simulates time advancement up to 3600 seconds (1 hour)
- Tests 63 different scenarios with various time manipulations

**If tests run slower than expected:**
1. Check system load
2. Verify vitest is running in run mode (not watch mode)
3. Check for debug output slowing execution

---

## Continuous Integration

For CI environments, use:

```bash
npm run test:run -- --reporter=junit --outputFile=test-results.xml src/__tests__/schema.test.ts src/__tests__/RateLimiter.test.ts
```

This generates a JUnit XML report suitable for CI systems like GitHub Actions, GitLab CI, Jenkins, etc.

---

## Next Steps After Verification

1. **If all tests pass:**
   - ✅ Mark WU-1 as complete
   - ✅ Commit changes
   - ✅ Create pull request
   - ✅ Reference this verification report in PR description

2. **If any tests fail:**
   - ❌ Investigate failure cause
   - ❌ Fix issues in fixtures.ts or test files
   - ❌ Re-run verification
   - ❌ Do not merge until all tests pass

---

## Additional Resources

- **Full verification report:** `/var/local/code/shawnbot/WU-1-VERIFICATION-REPORT.md`
- **Refactoring comparison:** `/var/local/code/shawnbot/WU-1-REFACTORING-COMPARISON.md`
- **Quick summary:** `/var/local/code/shawnbot/WU-1-SUMMARY.md`

---

**Happy Testing!** 🧪✅
