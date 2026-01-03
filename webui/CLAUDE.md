# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ***DO NOT EVER, UNDER *ANY* CIRCUMSTANCES, ATTEMPT *ANY* LAZY SHORTCUT AROUND STATIC TYPING, I SWEAR TO GOD IF THIS IS LESS TYPE SAFE THAN VANILLA RUST I WILL HAVE YOU ULTRATHINK ON WHAT A BAD CLAUDE YOU WERE ***##

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build to dist/
npm run preview   # Preview production build locally
npm run lint      # Check for lint errors
npm run lint:fix  # Auto-fix lint errors
npm run typecheck # Type check without emitting
npm test          # Run tests in watch mode (vitest)
npm run test:run  # Run tests once
npm run test:run -- src/__tests__/api.test.ts  # Run single test file
```

## Environment Setup

Create `.env.local` for development:
- `VITE_API_URL` - Admin API base URL (default: `http://localhost:3000`)
- `VITE_API_TOKEN` - Bearer token for API auth (matches bot's ADMIN_API_TOKEN)

## Architecture

Admin webui for the ShawnBot Discord bot. Communicates with the parent bot's Admin REST API.

### Tech Stack
- React 18+ with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Vitest for testing

### API Integration

The webui consumes the bot's Admin API running at `http://127.0.0.1:3000`.

**Authentication:** Bearer token in `Authorization` header for all `/api/*` endpoints.

**Endpoints:**
| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/health` | GET | No | `{ status, uptime, ready, guilds }` |
| `/api/status` | GET | Yes | `{ guilds, voiceConnections, memory }` |
| `/api/guilds/:id/status` | GET | Yes | `{ guildId, enabled, afkTimeoutSeconds, warningSecondsBefore, connected }` |
| `/api/guilds/:id/enable` | POST | Yes | `{ success, guildId, enabled }` |
| `/api/guilds/:id/disable` | POST | Yes | `{ success, guildId, enabled }` |

**Error responses:** `{ error: string, message: string }`

**Guild ID format:** Discord snowflake (17-19 digit numeric string)

### TypeScript Strictness

The project uses strict TypeScript with `noUncheckedIndexedAccess: true`. Array/object indexing returns `T | undefined`, requiring explicit checks before use.

### Testing

Tests use Vitest. Mock API responses rather than making real network calls. Test files follow `*.test.ts` pattern in `src/__tests__/`.
