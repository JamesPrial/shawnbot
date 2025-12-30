#!/bin/bash
# Verification script for WU-1: schema.test.ts and RateLimiter.test.ts refactoring

cd /var/local/code/shawnbot

echo "========================================="
echo "WU-1 Test Verification Report"
echo "========================================="
echo ""
echo "Running: npm run test:run -- src/__tests__/schema.test.ts src/__tests__/RateLimiter.test.ts"
echo ""

npm run test:run -- src/__tests__/schema.test.ts src/__tests__/RateLimiter.test.ts

EXIT_CODE=$?

echo ""
echo "========================================="
echo "Exit Code: $EXIT_CODE"
echo "========================================="

exit $EXIT_CODE
