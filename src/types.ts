import type { Collection } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { GuildScheduledEventRecurrenceRule } from 'discord.js';

export type EventType = 'regular' | 'adhoc' | 'cancelled';

export interface CalendarEvent {
  id: string;
  name: string;
  status: number;
  type: EventType;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  recurrenceRule: GuildScheduledEventRecurrenceRule | null;
}

export interface StorableEvent {
  id: string;
  name: string;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
}

export interface Command {
  // The builder narrows to a subtype after adding options/subcommands - accept any
  // object that has the two fields we actually use: name (for Collection key) and
  // toJSON (for REST registration).
  data: { name: string; toJSON(): object };
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
    pinnedMessageId?: string;
  }
}
