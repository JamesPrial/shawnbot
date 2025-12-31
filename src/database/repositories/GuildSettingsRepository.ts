import type Database from 'better-sqlite3';
import type { Logger } from 'pino';

export interface GuildSettings {
  guildId: string;
  enabled: boolean;
  afkTimeoutSeconds: number;
  warningSecondsBefore: number;
  warningChannelId: string | null;
  exemptRoleIds: string[];
  adminRoleIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface GuildSettingsRow {
  guild_id: string;
  enabled: number;
  afk_timeout_seconds: number;
  warning_seconds_before: number;
  warning_channel_id: string | null;
  exempt_role_ids: string | null;
  admin_role_ids: string | null;
  created_at: string;
  updated_at: string;
}

export class GuildSettingsRepository {
  private db: Database.Database;
  private logger: Logger;

  constructor(db: Database.Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  findByGuildId(guildId: string): GuildSettings | null {
    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        { guildId, action: 'db_query', operation: 'findByGuildId' },
        'Querying guild settings from database'
      );
    }

    const statement = this.db.prepare(`
      SELECT * FROM guild_settings WHERE guild_id = ?
    `);

    const row = statement.get(guildId) as GuildSettingsRow | undefined;

    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        { guildId, action: 'db_result', operation: 'findByGuildId', found: !!row },
        'Database query result'
      );
    }

    if (!row) {
      return null;
    }

    return this.mapRowToSettings(row);
  }

  upsert(settings: Partial<GuildSettings> & { guildId: string }): void {
    if (this.logger.isLevelEnabled('debug')) {
      const fields = Object.keys(settings).filter(key => key !== 'guildId');
      this.logger.debug(
        { guildId: settings.guildId, action: 'db_write', operation: 'upsert', fields },
        'Writing guild settings to database'
      );
    }

    const exemptRoleIdsJson = settings.exemptRoleIds
      ? JSON.stringify(settings.exemptRoleIds)
      : null;

    const adminRoleIdsJson = settings.adminRoleIds
      ? JSON.stringify(settings.adminRoleIds)
      : null;

    const statement = this.db.prepare(`
      INSERT INTO guild_settings (
        guild_id,
        enabled,
        afk_timeout_seconds,
        warning_seconds_before,
        warning_channel_id,
        exempt_role_ids,
        admin_role_ids,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled = COALESCE(excluded.enabled, enabled),
        afk_timeout_seconds = COALESCE(excluded.afk_timeout_seconds, afk_timeout_seconds),
        warning_seconds_before = COALESCE(excluded.warning_seconds_before, warning_seconds_before),
        warning_channel_id = COALESCE(excluded.warning_channel_id, warning_channel_id),
        exempt_role_ids = COALESCE(excluded.exempt_role_ids, exempt_role_ids),
        admin_role_ids = COALESCE(excluded.admin_role_ids, admin_role_ids),
        updated_at = CURRENT_TIMESTAMP
    `);

    statement.run(
      settings.guildId,
      settings.enabled !== undefined ? (settings.enabled ? 1 : 0) : null,
      settings.afkTimeoutSeconds ?? null,
      settings.warningSecondsBefore ?? null,
      settings.warningChannelId ?? null,
      exemptRoleIdsJson,
      adminRoleIdsJson
    );

    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        { guildId: settings.guildId, action: 'db_write_success', operation: 'upsert' },
        'Successfully wrote guild settings to database'
      );
    }
  }

  delete(guildId: string): void {
    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        { guildId, action: 'db_delete', operation: 'delete' },
        'Deleting guild settings from database'
      );
    }

    const statement = this.db.prepare(`
      DELETE FROM guild_settings WHERE guild_id = ?
    `);

    statement.run(guildId);
  }

  private mapRowToSettings(row: GuildSettingsRow): GuildSettings {
    const exemptRoleIds = this.safeParseJsonArray(row.exempt_role_ids, 'exempt_role_ids');
    const adminRoleIds = this.safeParseJsonArray(row.admin_role_ids, 'admin_role_ids');

    return {
      guildId: row.guild_id,
      enabled: row.enabled === 1,
      afkTimeoutSeconds: row.afk_timeout_seconds,
      warningSecondsBefore: row.warning_seconds_before,
      warningChannelId: row.warning_channel_id,
      exemptRoleIds,
      adminRoleIds,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private safeParseJsonArray(json: string | null, fieldName: string): string[] {
    if (!json) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(json);

      if (!Array.isArray(parsed)) {
        this.logger.warn(
          { fieldName, value: json, parsedType: typeof parsed },
          'Expected JSON array but got non-array value, returning empty array'
        );
        return [];
      }

      if (!parsed.every((item): item is string => typeof item === 'string')) {
        this.logger.warn(
          { fieldName, value: json, parsedType: 'array' },
          'JSON array contains non-string values, returning empty array'
        );
        return [];
      }

      return parsed;
    } catch (error) {
      this.logger.warn(
        { fieldName, value: json, error },
        'Failed to parse JSON array, returning empty array'
      );
      return [];
    }
  }
}
