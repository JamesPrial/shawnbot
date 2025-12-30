import { GuildSettingsRepository, type GuildSettings } from '../database/repositories/GuildSettingsRepository';
import { logger } from '../utils/logger';
import { formatError } from '../utils/errorUtils';

const DEFAULT_CONFIG: Omit<GuildSettings, 'guildId' | 'createdAt' | 'updatedAt'> = {
  enabled: false,
  afkTimeoutSeconds: 300,
  warningSecondsBefore: 60,
  warningChannelId: null,
  exemptRoleIds: [],
  adminRoleIds: [],
};

/**
 * Simple LRU (Least Recently Used) cache implementation.
 * Evicts the least recently accessed entry when max size is reached.
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove if exists to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export class GuildConfigService {
  private repository: GuildSettingsRepository;
  private cache: LRUCache<string, GuildSettings>;

  constructor(repository: GuildSettingsRepository, maxCacheSize: number = 1000) {
    this.repository = repository;
    this.cache = new LRUCache(maxCacheSize);
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
    try {
      this.repository.upsert({
        guildId,
        ...updates,
      });
    } catch (error) {
      logger.error({ error, guildId, updates }, 'Failed to upsert guild settings to database');
      throw new Error(
        `Failed to update guild settings for guild ${guildId}: ${formatError(error).message}`
      );
    }

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

  /**
   * Called when the bot is removed from a guild.
   * Clears the cache entry for the specified guild.
   */
  onGuildDelete(guildId: string): void {
    this.cache.delete(guildId);
    logger.debug({ guildId }, 'Cleared guild config cache on guild delete');
  }
}
