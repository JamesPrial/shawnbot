# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Run in development mode with tsx (hot reload)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled code from dist/
npm test         # Run tests in watch mode (vitest)
npm run test:run # Run tests once
npm run typecheck # Type check without emitting
```

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `DISCORD_TOKEN` - Bot token from Discord Developer Portal
- `CLIENT_ID` - Application ID from Discord Developer Portal
- `DATABASE_PATH` - SQLite database path (default: `./data/bot.db`)
- `LOG_LEVEL` - Logging verbosity: debug, info, warn, error

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
