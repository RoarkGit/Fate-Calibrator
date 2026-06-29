import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js';
import { fetchAllEvents, expandAllEvents } from './events';
import { renderMonth } from './render';
import { getDistinctTimezones } from '../db/timezones';

const imageCache = new Map<string, Buffer>();

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function cacheKey(yearMonth: string, tz: string): string {
  const serverTz = process.env.SERVER_TIMEZONE;
  return tz && tz !== serverTz ? `${yearMonth}:${tz}` : yearMonth;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number);
  return { year, month: month - 1 };
}

export async function rebuildCache(client: Client): Promise<void> {
  const rawEvents = await fetchAllEvents(client);
  const serverTz = process.env.SERVER_TIMEZONE!;
  const now = new Date();

  const months = new Set<string>();
  months.add(monthKey(now.getFullYear(), now.getMonth()));
  rawEvents.forEach((e) => {
    if (e.scheduledStartAt) {
      months.add(monthKey(e.scheduledStartAt.getFullYear(), e.scheduledStartAt.getMonth()));
    }
  });

  const sorted = Array.from(months).sort();
  if (sorted.length > 1) {
    const last = parseMonthKey(sorted[sorted.length - 1]);
    let cur = { year: now.getFullYear(), month: now.getMonth() };
    while (cur.year < last.year || (cur.year === last.year && cur.month <= last.month)) {
      months.add(monthKey(cur.year, cur.month));
      cur.month++;
      if (cur.month > 11) {
        cur.month = 0;
        cur.year++;
      }
    }
  }

  const lastKey = Array.from(months).sort().pop()!;
  const { year: lastY, month: lastM } = parseMonthKey(lastKey);
  const rangeEnd = new Date(lastY, lastM + 1, 0, 23, 59, 59);
  const events = expandAllEvents(rawEvents, rangeEnd);

  const userTzs = getDistinctTimezones().filter((tz) => tz !== serverTz);
  const allTimezones = [serverTz, ...userTzs];

  imageCache.clear();
  for (const tz of allTimezones) {
    for (const key of months) {
      const { year, month } = parseMonthKey(key);
      const buffer = renderMonth(year, month, events, tz, now);
      imageCache.set(cacheKey(key, tz), buffer);
    }
  }

  console.log(`Cache rebuilt: ${months.size} month(s) × ${allTimezones.length} timezone(s) = ${imageCache.size} images`);
}

export function get(yearMonth: string, tz: string): Buffer | null {
  return imageCache.get(cacheKey(yearMonth, tz)) ?? null;
}

export function buildNavComponents(
  year: number,
  month1: number,
  middleLabel = 'Show in my timezone',
  tzView = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const prev = new Date(year, month1 - 2, 1);
  const next = new Date(year, month1, 1);
  const thisKey = monthKey(year, month1 - 1);
  const p = tzView ? 'tz' : 'nav';

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${p}:${monthKey(prev.getFullYear(), prev.getMonth())}`)
        .setLabel('◀  Prev')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`tz:${thisKey}`)
        .setLabel(middleLabel)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${p}:${monthKey(next.getFullYear(), next.getMonth())}`)
        .setLabel('Next  ▶')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function getCurrentMonthPayload(): {
  files: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const key = monthKey(year, month);
  const buffer = imageCache.get(key);
  if (!buffer) throw new Error(`Cache miss for current month ${key}`);

  return {
    files: [new AttachmentBuilder(buffer, { name: 'calendar.png' })],
    components: buildNavComponents(year, month + 1),
  };
}
