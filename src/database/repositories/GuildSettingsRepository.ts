import type Database from 'better-sqlite3';

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

  constructor(db: Database.Database) {
    this.db = db;
  }

  findByGuildId(guildId: string): GuildSettings | null {
    const statement = this.db.prepare(`
      SELECT * FROM guild_settings WHERE guild_id = ?
    `);

    const row = statement.get(guildId) as GuildSettingsRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToSettings(row);
  }

  upsert(settings: Partial<GuildSettings> & { guildId: string }): void {
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
  }

  delete(guildId: string): void {
    const statement = this.db.prepare(`
      DELETE FROM guild_settings WHERE guild_id = ?
    `);

    statement.run(guildId);
  }

  private mapRowToSettings(row: GuildSettingsRow): GuildSettings {
    const exemptRoleIds = row.exempt_role_ids
      ? JSON.parse(row.exempt_role_ids) as string[]
      : [];

    const adminRoleIds = row.admin_role_ids
      ? JSON.parse(row.admin_role_ids) as string[]
      : [];

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
}
