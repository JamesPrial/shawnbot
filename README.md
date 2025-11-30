# ShawnBot

A Discord bot that detects AFK users in voice channels and kicks them after a configurable timeout.

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and configure:
   - `DISCORD_TOKEN` - Bot token from Discord Developer Portal
   - `CLIENT_ID` - Application ID from Discord Developer Portal
   - `DATABASE_PATH` - SQLite database path (default: `./data/bot.db`)
   - `LOG_LEVEL` - Logging verbosity: debug, info, warn, error
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
