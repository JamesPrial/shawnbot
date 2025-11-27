import { EventEmitter } from 'events';
import { VoiceConnection } from '@discordjs/voice';
import type { Logger } from 'pino';

export interface SpeakingTrackerEvents {
  userStartedSpeaking: (userId: string, guildId: string) => void;
  userStoppedSpeaking: (userId: string, guildId: string) => void;
}

export declare interface SpeakingTracker {
  on<Event extends keyof SpeakingTrackerEvents>(
    event: Event,
    listener: SpeakingTrackerEvents[Event]
  ): this;

  once<Event extends keyof SpeakingTrackerEvents>(
    event: Event,
    listener: SpeakingTrackerEvents[Event]
  ): this;

  emit<Event extends keyof SpeakingTrackerEvents>(
    event: Event,
    ...args: Parameters<SpeakingTrackerEvents[Event]>
  ): boolean;
}

export class SpeakingTracker extends EventEmitter {
  public connections: Map<string, VoiceConnection>;
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.connections = new Map();
    this.logger = logger;
  }

  public registerConnection(guildId: string, connection: VoiceConnection): void {
    if (this.connections.has(guildId)) {
      this.logger.warn({ guildId }, 'Connection already registered, replacing');
      this.unregisterConnection(guildId);
    }

    this.connections.set(guildId, connection);

    const receiver = connection.receiver;

    receiver.speaking.on('start', (userId: string) => {
      this.logger.debug({ userId, guildId }, 'User started speaking');
      this.emit('userStartedSpeaking', userId, guildId);
    });

    receiver.speaking.on('end', (userId: string) => {
      this.logger.debug({ userId, guildId }, 'User stopped speaking');
      this.emit('userStoppedSpeaking', userId, guildId);
    });

    this.logger.info({ guildId }, 'Voice connection registered for speaking tracking');
  }

  public unregisterConnection(guildId: string): void {
    const connection = this.connections.get(guildId);

    if (connection) {
      connection.receiver.speaking.removeAllListeners();
      this.connections.delete(guildId);
      this.logger.info({ guildId }, 'Voice connection unregistered from speaking tracking');
    }
  }

  public getConnection(guildId: string): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  public hasConnection(guildId: string): boolean {
    return this.connections.has(guildId);
  }

  public clear(): void {
    for (const guildId of this.connections.keys()) {
      this.unregisterConnection(guildId);
    }
    this.logger.info('All connections cleared from speaking tracker');
  }
}
