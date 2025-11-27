import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus
} from '@discordjs/voice';
import type { VoiceBasedChannel, Client } from 'discord.js';
import type { Logger } from 'pino';
import { SpeakingTracker } from './SpeakingTracker';
import { Readable } from 'stream';

export class VoiceConnectionManager {
  public connections: Map<string, VoiceConnection>;
  private speakingTracker: SpeakingTracker;
  private client: Client;
  private logger: Logger;

  constructor(speakingTracker: SpeakingTracker, client: Client, logger: Logger) {
    this.connections = new Map();
    this.speakingTracker = speakingTracker;
    this.client = client;
    this.logger = logger;
  }

  public async joinChannel(channel: VoiceBasedChannel): Promise<VoiceConnection> {
    const guildId = channel.guild.id;

    if (this.connections.has(guildId)) {
      this.logger.warn({ guildId, channelId: channel.id }, 'Already connected to a channel in this guild');
      return this.connections.get(guildId)!;
    }

    this.logger.info({ guildId, channelId: channel.id }, 'Joining voice channel');

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      this.logger.info({ guildId, channelId: channel.id }, 'Voice connection ready');
    } catch (error) {
      this.logger.error({ guildId, channelId: channel.id, error }, 'Failed to establish voice connection');
      connection.destroy();
      throw error;
    }

    this.connections.set(guildId, connection);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
        this.logger.info({ guildId }, 'Voice connection reconnecting');
      } catch (error) {
        this.logger.warn({ guildId, error }, 'Voice connection disconnected, cleaning up');
        this.leaveChannel(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      this.logger.info({ guildId }, 'Voice connection destroyed');
      this.leaveChannel(guildId);
    });

    await this.playSilence(connection);

    this.speakingTracker.registerConnection(guildId, connection);

    return connection;
  }

  public leaveChannel(guildId: string): void {
    const connection = this.connections.get(guildId);

    if (connection) {
      this.logger.info({ guildId }, 'Leaving voice channel');
      this.speakingTracker.unregisterConnection(guildId);
      connection.destroy();
      this.connections.delete(guildId);
    }
  }

  public getConnection(guildId: string): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  public hasConnection(guildId: string): boolean {
    return this.connections.has(guildId);
  }

  public getAllGuildIds(): string[] {
    return Array.from(this.connections.keys());
  }

  public disconnectAll(): void {
    this.logger.info('Disconnecting all voice connections');
    for (const guildId of this.connections.keys()) {
      this.leaveChannel(guildId);
    }
  }

  private async playSilence(connection: VoiceConnection): Promise<void> {
    return new Promise((resolve) => {
      const player = createAudioPlayer();

      const silenceBuffer = Buffer.from([0xF8, 0xFF, 0xFE]);
      const silenceStream = Readable.from(silenceBuffer);

      const resource = createAudioResource(silenceStream, {
        inputType: StreamType.Arbitrary
      });

      player.play(resource);
      connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, () => {
        player.stop();
        this.logger.debug({ guildId: connection.joinConfig.guildId }, 'Silent frame played to initialize voice reception');
        resolve();
      });

      setTimeout(() => {
        player.stop();
        resolve();
      }, 100);
    });
  }
}
