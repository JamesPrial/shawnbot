# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ***DO NOT EVER, UNDER *ANY* CIRCUMSTANCES, ATTEMPT *ANY* LAZY SHORTCUT AROUND STATIC TYPING, I SWEAR TO GOD IF THIS IS LESS TYPE SAFE THAN VANILLA RUST I WILL HAVE YOU ULTRATHINK ON WHAT A BAD CLAUDE YOU WERE ***##

## Commands

```bash
npm start        # Run bot with tsx
npm run dev      # Same as npm start
npm test         # Run tests in watch mode (vitest)
npm run test:run # Run tests once
npm run test:run -- src/__tests__/AFKDetectionService.test.ts  # Run single test file
npm run typecheck # Type check without emitting
npm run lint     # Check for lint errors
npm run lint:fix # Auto-fix lint errors
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `DISCORD_TOKEN` - Bot token from Discord Developer Portal
- `CLIENT_ID` - Application ID from Discord Developer Portal
- `DATABASE_PATH` - SQLite database path (default: `./data/bot.db`)
- `LOG_LEVEL` - Logging verbosity: debug, info, warn, error
- `LOG_FILE_PATH` - Optional: path to log file (logs to both console and file when set)
- `RATE_LIMIT_WARN_THRESHOLD` - Actions before warning (default: 20)
- `RATE_LIMIT_CRASH_THRESHOLD` - Actions before crash protection (default: 50)
- `RATE_LIMIT_WINDOW_MS` - Rate limit window in ms (default: 60000)
- `ADMIN_API_ENABLED` - Enable Admin REST API (default: false)
- `ADMIN_API_PORT` - Admin API port (default: 3000)
- `ADMIN_API_TOKEN` - Bearer token for API auth (required when API enabled)

## Architecture

This is a Discord bot that detects AFK users in voice channels using voice activity detection and kicks them after a configurable timeout.

### Core Event Flow

```
Voice speaking events → SpeakingTracker → AFKDetectionService (timers) → kick/warning
```

1. **VoiceConnectionManager** joins voice channels with `selfDeaf: false` to receive audio, plays silent frame to initialize reception
2. **SpeakingTracker** listens to `connection.receiver.speaking` events and emits `userStartedSpeaking`/`userStoppedSpeaking`
3. **AFKDetectionService** maintains per-user timers (keyed by `${guildId}:${userId}`), resets on speech, fires warning then kick
4. **VoiceMonitorService** handles auto-join when users enter voice and auto-leave when channels empty
5. **voiceStateUpdate handler** manages threshold logic - AFK tracking only starts when `MIN_USERS_FOR_AFK_TRACKING` (2) non-bot users are in a channel

### Dependency Injection

All services are instantiated in `bot.ts:createBot()` and wired together. The order matters due to dependencies:

```
GuildSettingsRepository → GuildConfigService → [WarningService, AFKDetectionService]
SpeakingTracker → VoiceConnectionManager → VoiceMonitorService
```

### Database

SQLite via better-sqlite3. Single table `guild_settings` stores per-guild config. Repository pattern in `database/repositories/`.

### Slash Commands

Commands are in `handlers/commands/`. Each exports:
- `data` - SlashCommandBuilder definition
- `execute(interaction, configService)` - Handler function

Commands: `/afk-config` (enable, disable, timeout, warning, channel, exempt) and `/afk-status`

### Voice Detection Constraint

Discord bots can only be in one voice channel per guild. The bot follows users when they switch channels.

### Testing

Tests use Vitest with fake timers for timer-based logic. Tests are in `src/__tests__/` and follow the pattern `*.test.ts`. The test suite mocks Discord.js objects and services extensively - see `AFKDetectionService.test.ts` for patterns.

Shared test fixtures are in `src/__tests__/fixtures.ts`:
- `createMockLogger()` - Mock pino logger with vi.fn() methods
- `createMockRateLimiter()` - Mock rate limiter
- `createMockGuildSettings(overrides)` - Guild config with sensible defaults
- `ENABLED_CONFIG` / `DISABLED_CONFIG` - Preset configurations
- `INVALID_CONFIGS` - Array of invalid config cases for parameterized tests

### TypeScript Strictness

The project uses strict TypeScript with `noUncheckedIndexedAccess: true`. Array/object indexing returns `T | undefined`, requiring explicit checks before use.

### Admin API

Optional REST API (`src/api/AdminApiService.ts`) for bot administration over HTTP.

**Lifecycle:**
- Instantiated in `bot.ts:createBot()` when `ADMIN_API_ENABLED=true`
- Starts after Discord client login in `index.ts`
- Stops during graceful shutdown before database close

**Security:**
- Binds to `127.0.0.1` only (localhost)
- Bearer token auth with timing-safe HMAC comparison
- Guild ID validation (Discord snowflake format)
- Audit logging for auth failures and admin operations

**Endpoints:**
- `GET /health` - Public health check
- `GET /api/status` - Bot metrics (auth required)
- `GET /api/guilds` - List all guilds (auth required)
- `GET /api/guilds/:id/status` - Guild status (auth required)
- `GET /api/guilds/:id/config` - Full guild config (auth required)
- `PUT /api/guilds/:id/config` - Update guild config (auth required)
- `DELETE /api/guilds/:id/config` - Reset guild to defaults (auth required)
- `POST /api/guilds/:id/enable` - Enable AFK detection (auth required)
- `POST /api/guilds/:id/disable` - Disable AFK detection (auth required)
