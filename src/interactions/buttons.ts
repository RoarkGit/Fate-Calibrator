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
  { value: 'Europe/London',       label: 'UK Time (GMT/BST)' },
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
      .setPlaceholder('Pick a timezone - or use /timezone set for any other zone')
      .addOptions(options),
  );
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.channelId !== process.env.CALENDAR_CHANNEL_ID) return;

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_tz:')) {
    return handleTzSelect(interaction);
  }

  if (!interaction.isButton()) return;

  const isSetTz = interaction.customId.startsWith('set_tz:');
  const isTz = !isSetTz && interaction.customId.startsWith('tz:');
  const isNav = !isSetTz && !isTz && interaction.customId.startsWith('nav:');
  if (!isNav && !isTz && !isSetTz) return;

  const prefixLen = isSetTz ? 'set_tz:'.length : 4;
  const targetKey = interaction.customId.slice(prefixLen);
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
  const tz = isNav ? serverTz : userTz;
  const key = monthKey(year, month);

  let buffer = get(key, tz);
  if (!buffer) {
    await interaction.editReply({ content: 'Generating calendar...', files: [], components: [] }).catch(() => {});
    const rawEvents = await fetchAllEvents(interaction.client);
    const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const events = expandAllEvents(rawEvents, rangeEnd);
    buffer = renderMonth(year, month, events, tz);
  }

  const view = isNav ? 'server' : 'user';
  const navRows = buildNavComponents(year, month + 1, view);
  const components = isSetTz ? [...navRows, buildTzSelectRow(key)] : navRows;

  await interaction.editReply({
    content: '',
    files: [new AttachmentBuilder(buffer, { name: 'calendar.png' })],
    components,
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

  // Dropdown dismissed after selection
  await interaction.editReply({
    content: '',
    files: [new AttachmentBuilder(buffer, { name: 'calendar.png' })],
    components: buildNavComponents(year, month + 1, 'user'),
  });
}
