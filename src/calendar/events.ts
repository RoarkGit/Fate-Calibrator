import { GuildScheduledEventRecurrenceRuleFrequency, type Client, type GuildScheduledEvent, GuildScheduledEventStatus } from 'discord.js';
import { getEventHistory } from '../db/timezones';
import type { CalendarEvent, EventType } from '../types';

let _cache: CalendarEvent[] | null = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 30_000;

export function invalidateEventCache(): void {
  _cache = null;
}

function getEventType(event: GuildScheduledEvent): EventType {
  if (event.status === GuildScheduledEventStatus.Canceled) return 'cancelled';
  if (!event.recurrenceRule) return 'adhoc';
  return 'regular';
}

export async function fetchAllEvents(client: Client): Promise<CalendarEvent[]> {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;

  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  const collection = await guild.scheduledEvents.fetch();
  const live: CalendarEvent[] = Array.from(collection.values()).map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    type: getEventType(e),
    scheduledStartAt: e.scheduledStartAt,
    scheduledEndAt: e.scheduledEndAt,
    recurrenceRule: e.recurrenceRule ?? null,
  }));

  const liveIds = new Set(live.map((e) => e.id));
  const liveById = new Map(live.map((e) => [e.id, e]));

  const history = getEventHistory().filter((h) => {
    if (!h.id.startsWith('cancelled:') && !h.id.startsWith('occurred:')) {
      return !liveIds.has(h.id);
    }

    if (h.id.startsWith('occurred:')) {
      const baseId = h.id.split(':')[1];
      const liveEvent = liveById.get(baseId);
      if (liveEvent?.scheduledStartAt && h.scheduledStartAt) {
        return h.scheduledStartAt.getTime() < liveEvent.scheduledStartAt.getTime();
      }
    }

    return true;
  });

  _cache = [...live, ...history];
  _cacheAt = now;
  return _cache;
}

export function expandEvent(event: CalendarEvent, rangeEnd: Date): CalendarEvent[] {
  const rule = event.recurrenceRule;
  if (!rule) return [event];

  const { frequency, interval } = rule;
  const duration =
    event.scheduledEndAt && event.scheduledStartAt
      ? event.scheduledEndAt.getTime() - event.scheduledStartAt.getTime()
      : 0;

  const effectiveEnd = rule.endAt && rule.endAt < rangeEnd ? rule.endAt : rangeEnd;
  const occurrences: CalendarEvent[] = [];
  let cur = new Date(event.scheduledStartAt!);

  while (cur <= effectiveEnd) {
    occurrences.push({
      ...event,
      scheduledStartAt: new Date(cur),
      scheduledEndAt: duration > 0 ? new Date(cur.getTime() + duration) : null,
    });

    const next = new Date(cur);
    if (frequency === GuildScheduledEventRecurrenceRuleFrequency.Weekly)
      next.setDate(next.getDate() + 7 * interval);
    else if (frequency === GuildScheduledEventRecurrenceRuleFrequency.Monthly)
      next.setMonth(next.getMonth() + interval);
    else if (frequency === GuildScheduledEventRecurrenceRuleFrequency.Yearly)
      next.setFullYear(next.getFullYear() + interval);
    else if (frequency === GuildScheduledEventRecurrenceRuleFrequency.Daily)
      next.setDate(next.getDate() + interval);
    else break;
    cur = next;
  }

  return occurrences.length > 0 ? occurrences : [event];
}

export function expandAllEvents(events: CalendarEvent[], rangeEnd: Date): CalendarEvent[] {
  const serverTz = process.env.SERVER_TIMEZONE ?? 'UTC';

  const markers: { baseId: string; dateStr: string; event: CalendarEvent }[] = [];
  const realEvents: CalendarEvent[] = [];

  for (const e of events) {
    if (typeof e.id === 'string' && e.id.startsWith('cancelled:')) {
      const parts = e.id.split(':');
      const baseId = parts[1];
      const dateStr = parts[2];
      if (baseId && dateStr) markers.push({ baseId, dateStr, event: e });
    } else {
      realEvents.push(e);
    }
  }

  const cancelMap = new Map<string, Map<string, CalendarEvent>>();
  for (const m of markers) {
    if (!cancelMap.has(m.baseId)) cancelMap.set(m.baseId, new Map());
    cancelMap.get(m.baseId)!.set(m.dateStr, m.event);
  }

  const consumed = new Set<string>();

  const expanded = realEvents.flatMap((e) => {
    const occurrences = expandEvent(e, rangeEnd);
    if (!cancelMap.has(e.id)) return occurrences;

    const cancels = cancelMap.get(e.id)!;
    return occurrences.map((occ) => {
      if (!occ.scheduledStartAt) return occ;
      const { year, month, day } = getLocalDateParts(occ.scheduledStartAt, serverTz);
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (cancels.has(dateKey)) {
        consumed.add(`${e.id}:${dateKey}`);
        return { ...occ, type: 'cancelled' as EventType, status: 4 };
      }
      return occ;
    });
  });

  for (const { baseId, dateStr, event } of markers) {
    if (!consumed.has(`${baseId}:${dateStr}`)) {
      expanded.push({ ...event, type: 'cancelled', status: 4 });
    }
  }

  return expanded;
}

export function getLocalDateParts(date: Date, tz: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = fmt.format(date).split('-').map(Number);
  return { year, month: month - 1, day };
}
