import { GuildSettingsRepository, type GuildSettings } from '../database/repositories/GuildSettingsRepository';

const DEFAULT_CONFIG: Omit<GuildSettings, 'guildId' | 'createdAt' | 'updatedAt'> = {
  enabled: false,
  afkTimeoutSeconds: 300,
  warningSecondsBefore: 60,
  warningChannelId: null,
  exemptRoleIds: [],
  adminRoleIds: [],
};

export class GuildConfigService {
  private repository: GuildSettingsRepository;
  private cache: Map<string, GuildSettings>;

  constructor(repository: GuildSettingsRepository) {
    this.repository = repository;
    this.cache = new Map();
  }

  getConfig(guildId: string): GuildSettings {
    const cached = this.cache.get(guildId);
    if (cached) {
      return cached;
    }

    const fromDatabase = this.repository.findByGuildId(guildId);
    if (fromDatabase) {
      this.cache.set(guildId, fromDatabase);
      return fromDatabase;
    }

    const defaultConfig: GuildSettings = {
      guildId,
      ...DEFAULT_CONFIG,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return defaultConfig;
  }

  updateConfig(guildId: string, updates: Partial<GuildSettings>): GuildSettings {
    this.repository.upsert({
      guildId,
      ...updates,
    });

    const updatedConfig = this.repository.findByGuildId(guildId);
    if (!updatedConfig) {
      throw new Error(`Failed to retrieve updated config for guild ${guildId}`);
    }

    this.cache.set(guildId, updatedConfig);
    return updatedConfig;
  }

  clearCache(guildId?: string): void {
    if (guildId) {
      this.cache.delete(guildId);
    } else {
      this.cache.clear();
    }
  }
}
