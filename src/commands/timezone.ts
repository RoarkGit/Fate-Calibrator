import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { setTimezone, getTimezone } from '../db/timezones';
import { searchTimezones, formatChoice } from '../data/timezones';
import type { Command } from '../types';

export const data = new SlashCommandBuilder()
  .setName('timezone')
  .setDescription('Manage your timezone for calendar display')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Set your timezone')
      .addStringOption((opt) =>
        opt
          .setName('tz')
          .setDescription('Start typing a city, region, or abbreviation')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('get').setDescription('Show your currently registered timezone'));

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const choices = searchTimezones(focused).map(formatChoice);

  // If the typed value is a valid IANA name not already in the suggestions, append it.
  if (focused && choices.length < 25 && !choices.some((c) => c.value === focused)) {
    try {
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: focused,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      }).format(new Date());
      choices.push({ name: `${focused}  ${formatted}`, value: focused });
    } catch {
      // not a valid IANA name
    }
  }

  await interaction.respond(choices);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const tz = interaction.options.getString('tz', true).trim();

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    } catch {
      await interaction.reply({
        content: `\`${tz}\` isn't a recognised timezone. Pick one from the autocomplete list, or use an IANA name like \`America/New_York\`.`,
        ephemeral: true,
      });
      return;
    }

    setTimezone(interaction.user.id, tz);
    await interaction.reply({
      content: `Timezone set to \`${tz}\`. Click **My Timezone** on the calendar to see events in your local time.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === 'get') {
    const tz = getTimezone(interaction.user.id);
    const msg = tz
      ? `Your timezone is \`${tz}\`.`
      : `No timezone set - calendar shows server time (\`${process.env.SERVER_TIMEZONE}\`). Use \`/timezone set\` to register yours.`;
    await interaction.reply({ content: msg, ephemeral: true });
  }
}

export default { data, execute, autocomplete } satisfies Command;
