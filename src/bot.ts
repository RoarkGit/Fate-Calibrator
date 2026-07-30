import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  GuildScheduledEventStatus,
  REST,
  Routes,
} from 'discord.js';
import { initDb, storeEventHistory, hasEventHistoryEntry } from './db/timezones';
import { rebuildCache, getCurrentMonthPayload } from './calendar/cache';
import { invalidateEventCache } from './calendar/events';
import { handleInteraction } from './interactions/buttons';
import { startScheduler } from './scheduler';
import timezoneCmd from './commands/timezone';
import cancelCmd from './commands/cancel';
import purgeEntryCmd from './commands/purge-entry';
import './types';

function toServerDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.SERVER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function rebuildAndUpdate(client: Client): Promise<void> {
  await rebuildCache(client);
  await updatePinnedMessage(client);
}

export async function startBot(): Promise<void> {
  initDb();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildScheduledEvents],
  });

  client.commands = new Collection();
  client.commands.set(timezoneCmd.data.name, timezoneCmd);
  client.commands.set(cancelCmd.data.name, cancelCmd);
  client.commands.set(purgeEntryCmd.data.name, purgeEntryCmd);

  client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);

    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    const commandData = [...client.commands.values()].map((cmd) => cmd.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!), {
      body: commandData,
    });
    console.log(`Registered ${commandData.length} slash command(s).`);

    await rebuildCache(client);
    await ensurePinnedMessage(client);
    startScheduler(client, rebuildAndUpdate);
    console.log('Bot ready.');
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction).catch(console.error);
      return;
    }
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction).catch(console.error);
      return;
    }
    await handleInteraction(interaction);
  });

  client.on(Events.GuildScheduledEventCreate, async (event) => {
    if (event.guildId !== process.env.GUILD_ID) return;
    invalidateEventCache();
    await rebuildAndUpdate(client).catch(console.error);
  });

  // oldEvent can be PartialGuildScheduledEvent (if it wasn't cached) - let TypeScript infer
  // the correct union type from the discord.js overload and use null-safe access throughout.
  client.on(Events.GuildScheduledEventUpdate, async (oldEvent, newEvent) => {
    if (newEvent.guildId !== process.env.GUILD_ID) return;
    invalidateEventCache();

    // Cancellations are no longer inferred from Discord's own gateway events here - Discord's
    // Bot API only ever exposes one occurrence per recurring series (the current one), so it
    // can't reliably tell us which date a native "Cancel this Event" actually targeted. /cancel
    // is the sole path for recording a cancellation now, and it mirrors to the real Discord
    // event itself when the target is unambiguous (see commands/cancel.ts).
    if (
      oldEvent?.recurrenceRule &&
      oldEvent.scheduledStartAt &&
      newEvent.scheduledStartAt &&
      oldEvent.scheduledStartAt.getTime() !== newEvent.scheduledStartAt.getTime()
    ) {
      const dateStr = toServerDateStr(oldEvent.scheduledStartAt);
      const wasComplete = Date.now() >= oldEvent.scheduledStartAt.getTime();
      // PartialGuildScheduledEvent.name is string | null; fall back to ID if somehow null.
      const eventName = oldEvent.name ?? oldEvent.id;
      const alreadyCancelled = hasEventHistoryEntry(`cancelled:${oldEvent.id}:${dateStr}`);

      if (wasComplete && alreadyCancelled) {
        console.log(`Skipping occurrence capture for ${eventName} on ${dateStr}: already marked cancelled`);
      } else if (wasComplete) {
        storeEventHistory(
          {
            id: `occurred:${oldEvent.id}:${dateStr}`,
            name: eventName,
            scheduledStartAt: oldEvent.scheduledStartAt,
            scheduledEndAt: oldEvent.scheduledEndAt,
          },
          'regular',
        );
        console.log(`Captured occurrence: ${eventName} on ${dateStr}`);
      }
    } else if (newEvent.status === GuildScheduledEventStatus.Completed && !newEvent.recurrenceRule) {
      storeEventHistory(
        {
          id: newEvent.id,
          name: newEvent.name,
          scheduledStartAt: newEvent.scheduledStartAt,
          scheduledEndAt: newEvent.scheduledEndAt,
        },
        'adhoc',
      );
      console.log(`Captured ad-hoc completion: ${newEvent.name}`);
    }

    await rebuildAndUpdate(client).catch(console.error);
  });

  client.on(Events.GuildScheduledEventDelete, async (event) => {
    if (event.guildId !== process.env.GUILD_ID) return;
    invalidateEventCache();

    const isCompleted = event.status === GuildScheduledEventStatus.Completed;

    const eventName = event.name ?? event.id;
    if (isCompleted && !event.recurrenceRule) {
      storeEventHistory(
        {
          id: event.id,
          name: eventName,
          scheduledStartAt: event.scheduledStartAt,
          scheduledEndAt: event.scheduledEndAt,
        },
        'adhoc',
      );
      console.log(`Captured ad-hoc completion (delete): ${eventName}`);
    }
    // Deletion of a future/unstarted event is no longer inferred as a cancellation here, for the
    // same reason as GuildScheduledEventUpdate above - /cancel is the sole recorded path now.

    await rebuildAndUpdate(client).catch(console.error);
  });

  await client.login(process.env.DISCORD_TOKEN);
}

async function ensurePinnedMessage(client: Client): Promise<void> {
  const channel = await client.channels.fetch(process.env.CALENDAR_CHANNEL_ID!);
  // isSendable() narrows to channels that have send() (excludes PartialGroupDMChannel)
  if (!channel?.isSendable()) throw new Error('CALENDAR_CHANNEL_ID is not a sendable channel');

  // fetchPins() returns { hasMore, items: MessagePin[] }, where each item wraps
  // the actual message as `.message` (not a Collection/array of Message itself).
  const { items } = await channel.messages.fetchPins();
  const existing = items.find((pin) => pin.message.author?.id === client.user?.id)?.message;

  await cleanupChannel(channel, client.user?.id ?? '', existing?.id ?? null);

  if (existing) {
    client.pinnedMessageId = existing.id;
    await updatePinnedMessage(client);
    return;
  }

  const payload = getCurrentMonthPayload();
  const msg = await channel.send(payload);
  client.pinnedMessageId = msg.id;

  try {
    await msg.pin();
  } catch {
    console.warn(
      'Could not pin calendar message (Missing Permissions?). Bot will still work but message ID recovery on restart requires pinning.',
    );
  }
}

async function cleanupChannel(
  channel: { messages: { fetch(opts: { limit: number }): Promise<Map<string, { author: { id: string }; id: string; delete(): Promise<unknown> }>> } },
  botUserId: string,
  keepId: string | null,
): Promise<void> {
  const messages = await channel.messages.fetch({ limit: 100 });
  for (const [, msg] of messages) {
    if (msg.author.id === botUserId && msg.id !== keepId) {
      await msg.delete().catch(() => {});
    }
  }
}

async function updatePinnedMessage(client: Client): Promise<void> {
  if (!client.pinnedMessageId) return;
  const channel = await client.channels.fetch(process.env.CALENDAR_CHANNEL_ID!);
  if (!channel?.isSendable()) return;
  const msg = await channel.messages.fetch(client.pinnedMessageId);
  await msg.edit(getCurrentMonthPayload());
}
