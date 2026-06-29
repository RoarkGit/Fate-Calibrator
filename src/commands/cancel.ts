import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { storeCancelledEvent } from '../db/timezones';
import { fetchAllEvents, expandEvent, getLocalDateParts } from '../calendar/events';
import { rebuildCache, getCurrentMonthPayload } from '../calendar/cache';
import type { Command } from '../types';

export const data = new SlashCommandBuilder()
  .setName('cancel')
  .setDescription('Manually mark an event as cancelled (for events cancelled while bot was offline)')
  .addStringOption((opt) =>
    opt
      .setName('event_id')
      .setDescription('Discord event ID - pick from the list or paste the snowflake')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('date')
      .setDescription('For recurring series: which occurrence date (YYYY-MM-DD in server timezone)')
      .setRequired(false),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  try {
    const rawEvents = await fetchAllEvents(interaction.client);
    const serverTz = process.env.SERVER_TIMEZONE!;

    const choices = rawEvents
      .filter((e) => e.status !== 4 && e.scheduledStartAt)
      .filter((e) => !focused || e.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((e) => {
        const { year, month, day } = getLocalDateParts(e.scheduledStartAt!, serverTz);
        const dateLabel = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const suffix = e.recurrenceRule ? ' (series)' : '';
        return { name: `${e.name}${suffix} - ${dateLabel}`, value: e.id };
      });

    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const eventId = interaction.options.getString('event_id', true).trim();
  const dateStr = interaction.options.getString('date')?.trim() ?? null;

  const rawEvents = await fetchAllEvents(interaction.client);
  const liveEvent = rawEvents.find((e) => e.id === eventId && e.status !== 4);

  if (!liveEvent) {
    await interaction.editReply({
      content: `Event \`${eventId}\` isn't in Discord's API - it may have already been captured automatically. If it still appears incorrectly on the calendar, check the bot logs.`,
    });
    return;
  }

  if (liveEvent.recurrenceRule) {
    if (!dateStr) {
      await interaction.editReply({
        content: `**${liveEvent.name}** is a recurring series. Provide a \`date\` (YYYY-MM-DD) to specify which occurrence to cancel.`,
      });
      return;
    }

    const dateParts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateParts) {
      await interaction.editReply({ content: 'Invalid date format. Use YYYY-MM-DD, e.g. `2026-07-05`.' });
      return;
    }
    const [, yStr, mStr, dStr] = dateParts;
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    const targetDate = { year: y, month: m - 1, day: d };

    const rangeEnd = new Date(y, m - 1, d + 1, 23, 59, 59);
    const serverTz = process.env.SERVER_TIMEZONE!;
    const occurrences = expandEvent(liveEvent, rangeEnd);
    const match = occurrences.find((occ) => {
      if (!occ.scheduledStartAt) return false;
      const p = getLocalDateParts(occ.scheduledStartAt, serverTz);
      return p.year === targetDate.year && p.month === targetDate.month && p.day === targetDate.day;
    });

    if (!match) {
      await interaction.editReply({
        content: `No occurrence of **${liveEvent.name}** found on ${dateStr} in the server timezone. Check the date and try again.`,
      });
      return;
    }

    storeCancelledEvent({
      id: `cancelled:${eventId}:${dateStr}`,
      name: liveEvent.name,
      scheduledStartAt: match.scheduledStartAt,
      scheduledEndAt: match.scheduledEndAt,
    });
  } else {
    storeCancelledEvent({
      id: eventId,
      name: liveEvent.name,
      scheduledStartAt: liveEvent.scheduledStartAt,
      scheduledEndAt: liveEvent.scheduledEndAt,
    });
  }

  await rebuildCache(interaction.client);

  try {
    const channel = await interaction.client.channels.fetch(process.env.CALENDAR_CHANNEL_ID!);
    if (interaction.client.pinnedMessageId && channel?.isTextBased()) {
      const msg = await channel.messages.fetch(interaction.client.pinnedMessageId);
      await msg.edit(getCurrentMonthPayload());
    }
  } catch (err) {
    console.error('Failed to update pinned message after /cancel:', err);
  }

  const dateDisplay = dateStr ? ` on ${dateStr}` : '';
  await interaction.editReply({
    content: `Marked **${liveEvent.name}**${dateDisplay} as cancelled on the calendar.`,
  });
}

export default { data, execute, autocomplete } satisfies Command;
