import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { get, buildNavComponents, monthKey, rebuildCache } from '../calendar/cache';
import { getTimezone, setTimezone } from '../db/timezones';
import { renderMonth } from '../calendar/render';
import { fetchAllEvents, expandAllEvents } from '../calendar/events';

const SELECT_TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern Time (ET)' },
  { value: 'America/Chicago',     label: 'Central Time (CT)' },
  { value: 'America/Denver',      label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix',     label: 'Arizona - no DST (MST)' },
  { value: 'America/Anchorage',   label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii Time (HST)' },
  { value: 'America/Halifax',     label: 'Atlantic Time (AT)' },
  { value: 'America/St_Johns',    label: 'Newfoundland Time (NT)' },
  { value: 'Europe/London',       label: 'London (GMT/BST)' },
  { value: 'Europe/Paris',        label: 'Central European (CET)' },
  { value: 'Europe/Helsinki',     label: 'Eastern European (EET)' },
  { value: 'Europe/Moscow',       label: 'Moscow Time (MSK)' },
  { value: 'Europe/Istanbul',     label: 'Turkey Time (TRT)' },
  { value: 'Africa/Johannesburg', label: 'South Africa (SAST)' },
  { value: 'Asia/Dubai',          label: 'Gulf Time (GST)' },
  { value: 'Asia/Kolkata',        label: 'India (IST)' },
  { value: 'Asia/Singapore',      label: 'Singapore / Malaysia (SGT)' },
  { value: 'Asia/Hong_Kong',      label: 'Hong Kong (HKT)' },
  { value: 'Asia/Shanghai',       label: 'China Standard (CST)' },
  { value: 'Asia/Tokyo',          label: 'Japan (JST)' },
  { value: 'Asia/Seoul',          label: 'Korea (KST)' },
  { value: 'Australia/Sydney',    label: 'Eastern Australia (AEST)' },
  { value: 'Pacific/Auckland',    label: 'New Zealand (NZST)' },
  { value: 'UTC',                 label: 'UTC' },
];

function buildTzSelectRow(key: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const now = new Date();
  const options = SELECT_TIMEZONES.map((tz) => {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: tz.value,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(now);
    return { label: `${tz.label} ${time}`, value: tz.value };
  });
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`select_tz:${key}`)
      .setPlaceholder('Set my timezone…')
      .addOptions(options),
  );
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.channelId !== process.env.CALENDAR_CHANNEL_ID) return;

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_tz:')) {
    return handleTzSelect(interaction);
  }

  if (!interaction.isButton()) return;

  const isTz = interaction.customId.startsWith('tz:');
  if (!interaction.customId.startsWith('nav:') && !isTz) return;

  const targetKey = interaction.customId.slice(isTz ? 3 : 4);
  const [yearStr, monthStr] = targetKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);
  if (isEphemeral) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const serverTz = process.env.SERVER_TIMEZONE!;
  const userTz = (await getTimezone(interaction.user.id)) ?? serverTz;
  const tz = isTz ? userTz : serverTz;
  const key = monthKey(year, month);

  let buffer = get(key, tz);

  if (!buffer) {
    await interaction.editReply({ content: 'Generating calendar…', files: [], components: [] }).catch(() => {});
    const rawEvents = await fetchAllEvents(interaction.client);
    const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const events = expandAllEvents(rawEvents, rangeEnd);
    buffer = renderMonth(year, month, events, tz);
  }

  const navRow = buildNavComponents(year, month + 1, isTz ? 'Set my timezone' : 'Show in my timezone', isTz);
  await interaction.editReply({
    content: '',
    files: [new AttachmentBuilder(buffer, { name: 'calendar.png' })],
    components: isTz ? [navRow[0], buildTzSelectRow(key)] : navRow,
  });
}

async function handleTzSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();

  const key = interaction.customId.slice('select_tz:'.length);
  const [yearStr, monthStr] = key.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const selectedTz = interaction.values[0];
  setTimezone(interaction.user.id, selectedTz);

  rebuildCache(interaction.client).catch(console.error);

  let buffer = get(key, selectedTz);
  if (!buffer) {
    const rawEvents = await fetchAllEvents(interaction.client);
    const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const events = expandAllEvents(rawEvents, rangeEnd);
    buffer = renderMonth(year, month, events, selectedTz);
  }

  await interaction.editReply({
    content: '',
    files: [new AttachmentBuilder(buffer, { name: 'calendar.png' })],
    components: [...buildNavComponents(year, month + 1, 'Set my timezone', true), buildTzSelectRow(key)],
  });
}
