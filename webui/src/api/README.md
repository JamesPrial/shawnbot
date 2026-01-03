# API Client

TypeScript client for the ShawnBot Admin API with strict type safety.

## Usage

### Health Check (Public)

```typescript
import { getHealth } from './api/client';

const result = await getHealth();

if (result.success) {
  console.log(`Bot status: ${result.data.status}`);
  console.log(`Uptime: ${result.data.uptime}s`);
  console.log(`Ready: ${result.data.ready}`);
  console.log(`Guilds: ${result.data.guilds}`);
} else {
  console.error(`Error: ${result.error} - ${result.message}`);
}
```

### Bot Status (Authenticated)

```typescript
import { getStatus } from './api/client';

const token = import.meta.env.VITE_API_TOKEN;
const result = await getStatus(token);

if (result.success) {
  console.log(`Guilds: ${result.data.guilds}`);
  console.log(`Voice connections: ${result.data.voiceConnections}`);
  console.log(`Memory usage: ${result.data.memory.heapUsed} bytes`);
} else if (result.error === 'UNAUTHORIZED') {
  console.error('Invalid API token');
} else {
  console.error(`Error: ${result.error} - ${result.message}`);
}
```

## Error Handling

All API functions return `ApiResult<T>`, a discriminated union type:

```typescript
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; message: string };
```

### Error Types

- `NETWORK_ERROR` - Network failure (fetch exception)
- `UNAUTHORIZED` - Invalid authentication token (HTTP 401)
- `API_ERROR` - Server error with HTTP status (4xx/5xx)
- `INVALID_RESPONSE` - Response body doesn't match expected shape

### Type-Safe Error Handling

```typescript
const result = await getStatus(token);

// TypeScript knows result.success discriminates the union
if (result.success) {
  // result.data is available and properly typed
  const guilds: number = result.data.guilds;
} else {
  // result.error and result.message are available
  const errorCode: string = result.error;
  const errorMessage: string = result.message;
}
```

## Configuration

Set environment variables in `.env.local`:

```bash
# Admin API base URL (default: empty string for Vite proxy)
VITE_API_URL=http://localhost:3000

# Bearer token for authentication
VITE_API_TOKEN=<your-bearer-token>
```

## Type Definitions

See `types.ts` for all API response interfaces:

- `HealthResponse` - GET /health
- `StatusResponse` - GET /api/status
- `GuildStatusResponse` - GET /api/guilds/:id/status
- `OperationResponse` - POST /api/guilds/:id/enable|disable
- `ErrorResponse` - Error response format
- `ApiResult<T>` - Result union type

## Testing

Tests are in `__tests__/api.test.ts` and verify:

- ✓ Successful responses with valid data
- ✓ Network error handling
- ✓ HTTP error responses (4xx/5xx)
- ✓ 401 Unauthorized specific handling
- ✓ Malformed JSON responses
- ✓ Invalid response shapes
- ✓ Missing or wrong-type fields

Run tests:

```bash
npm test -- src/__tests__/api.test.ts
```
