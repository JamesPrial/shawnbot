# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Run in development mode with tsx (hot reload)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled code from dist/
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

1. **VoiceConnectionManager** joins voice channels with `selfDeaf: false` to receive audio
2. **SpeakingTracker** listens to `connection.receiver.speaking` events and emits `userStartedSpeaking`/`userStoppedSpeaking`
3. **AFKDetectionService** maintains per-user timers (keyed by `${guildId}:${userId}`), resets on speech, fires warning then kick
4. **VoiceMonitorService** handles auto-join when users enter voice and auto-leave when channels empty

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
