import { ChatInputCommandInteraction } from 'discord.js';
import { GuildConfigService } from '../../services/GuildConfigService';
import * as afkConfig from './afk-config';
import * as afkStatus from './afk-status';

export type CommandHandler = (
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService
) => Promise<void>;

export interface Command {
  data: {
    name: string;
    toJSON: () => unknown;
  };
  execute: CommandHandler;
}

export const afkConfigCommand: Command = {
  data: afkConfig.data,
  execute: afkConfig.execute,
};

export const afkStatusCommand: Command = {
  data: afkStatus.data,
  execute: afkStatus.execute,
};

export const commands = [
  afkConfig.data,
  afkStatus.data,
];

export { afkConfig, afkStatus };
