import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getEventHistory, deleteEventHistoryEntry } from '../db/timezones';
import { invalidateEventCache, getLocalDateParts } from '../calendar/events';
import { rebuildCache, getCurrentMonthPayload } from '../calendar/cache';
import type { Command } from '../types';

const LEADS_ROLE_NAME = 'Lead';

export const data = new SlashCommandBuilder()
  .setName('purge-entry')
  .setDescription('[Lead] Delete an accidental duplicate/erroneous calendar history entry and reprint the calendar')
  .addStringOption((opt) =>
    opt
      .setName('entry_id')
      .setDescription('The history entry to delete - pick from the list')
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const serverTz = process.env.SERVER_TIMEZONE!;
  try {
    const choices = getEventHistory()
      .filter((e) => !focused || e.name.toLowerCase().includes(focused) || e.id.toLowerCase().includes(focused))
      .sort((a, b) => (b.scheduledStartAt?.getTime() ?? 0) - (a.scheduledStartAt?.getTime() ?? 0))
      .slice(0, 25)
      .map((e) => {
        const dateLabel = e.scheduledStartAt
          ? (() => {
              const { year, month, day } = getLocalDateParts(e.scheduledStartAt!, serverTz);
              return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            })()
          : 'unknown date';
        return { name: `[${e.type}] ${e.name} - ${dateLabel}`.slice(0, 100), value: e.id };
      });

    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild() || !interaction.member.roles.cache.some((r) => r.name === LEADS_ROLE_NAME)) {
    await interaction.reply({
      content: `Only members with the **${LEADS_ROLE_NAME}** role can use this command.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const entryId = interaction.options.getString('entry_id', true).trim();
  const deleted = deleteEventHistoryEntry(entryId);

  if (!deleted) {
    await interaction.editReply({
      content: `No history entry with id \`${entryId}\` was found - it may have already been removed.`,
    });
    return;
  }

  invalidateEventCache();
  await rebuildCache(interaction.client);

  try {
    const channel = await interaction.client.channels.fetch(process.env.CALENDAR_CHANNEL_ID!);
    if (interaction.client.pinnedMessageId && channel?.isSendable()) {
      const msg = await channel.messages.fetch(interaction.client.pinnedMessageId);
      await msg.edit(getCurrentMonthPayload());
    }
  } catch (err) {
    console.error('Failed to update pinned message after /purge-entry:', err);
  }

  await interaction.editReply({
    content: `Deleted history entry \`${entryId}\` and refreshed the calendar.`,
  });
}

export default { data, execute, autocomplete } satisfies Command;
