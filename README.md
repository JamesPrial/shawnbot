# ShawnBot

A Discord bot that detects AFK users in voice channels and kicks them after a configurable timeout.

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and configure:
   - `DISCORD_TOKEN` - Bot token from Discord Developer Portal
   - `CLIENT_ID` - Application ID from Discord Developer Portal
   - `DATABASE_PATH` - SQLite database path (default: `./data/bot.db`)
   - `LOG_LEVEL` - Logging verbosity: debug, info, warn, error
   - `LOG_FILE_PATH` - Optional: path to log file (logs to both console and file when set)
   - `RATE_LIMIT_WARN_THRESHOLD` - Actions before warning (default: 20)
   - `RATE_LIMIT_CRASH_THRESHOLD` - Actions before crash protection (default: 50)
   - `RATE_LIMIT_WINDOW_MS` - Rate limit window in ms (default: 60000)
3. Run `npm install`
4. Run `npm start`

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run bot |
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run typecheck` | Type check without emitting |

## Slash Commands

- `/afk-config` - Configure AFK detection (enable, disable, timeout, warning, channel, exempt)
- `/afk-status` - View current AFK detection status

## How It Works

1. Bot joins voice channels with audio reception enabled
2. Tracks speaking activity via Discord's voice events
3. Starts AFK timers when users stop speaking (requires 2+ non-bot users in channel)
4. Sends warning before kicking AFK users

## Tech Stack

- TypeScript + tsx
- Discord.js
- SQLite (better-sqlite3)
- Vitest for testing

## Admin API

Optional REST API for bot administration. Binds to localhost only (127.0.0.1) for security.

### Configuration

```bash
ADMIN_API_ENABLED=true           # Enable the API (default: false)
ADMIN_API_PORT=3000              # Port to listen on (default: 3000)
ADMIN_API_TOKEN=your_secret      # Required when API is enabled
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check (uptime, ready, guilds) |
| GET | `/api/status` | Yes | Bot metrics (guilds, voice connections, memory) |
| GET | `/api/guilds/:id/status` | Yes | Guild config and connection status |
| POST | `/api/guilds/:id/enable` | Yes | Enable AFK detection for guild |
| POST | `/api/guilds/:id/disable` | Yes | Disable AFK detection for guild |

### Authentication

Protected endpoints require a Bearer token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:3000/api/status
```

### Examples

```bash
# Health check (no auth required)
curl http://127.0.0.1:3000/health

# Get bot status
curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:3000/api/status

# Enable AFK detection for a guild
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://127.0.0.1:3000/api/guilds/123456789012345678/enable
```
