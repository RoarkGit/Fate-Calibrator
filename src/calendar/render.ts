import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { getLocalDateParts } from './events';
import type { CalendarEvent, EventType } from '../types';

const WIDTH = 1400;
const CELL_W = 200;
const TITLE_H = 36;
const DAY_H = 28;
const HEADER_H = TITLE_H + DAY_H;
const CELL_H = 140;
const ROWS = 6;
const LEGEND_H = 60;
const HEIGHT = HEADER_H + ROWS * CELL_H + LEGEND_H;

const CELL_PAD = 10;
const DATE_AREA_H = 36;
const PILL_H = 28;
const PILL_GAP = 4;
const MAX_PILLS = 3;
const TODAY_R = 11;

const COLORS = {
  bg: '#0f1117',
  cellBg: '#151822',
  cellBgOut: '#0b0d14',
  cellBgRaidWeek: '#0e1a2e',
  border: '#222537',
  blurple: '#5865F2',
  dateNum: '#c8d0e8',
  dateNumPast: '#3c4260',
  dateNumOut: '#252840',
  dayHeader: '#6070a0',
  titleText: '#e2e8f8',
  legendText: '#9baac8',
};

const EVENT_COLORS: Record<EventType, { bg: string; text: string }> = {
  regular: { bg: '#0b2614', text: '#4ade80' },
  cancelled: { bg: '#260b0b', text: '#f87171' },
  adhoc: { bg: '#1a0b28', text: '#c084fc' },
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface GridCell {
  day: number;
  inMonth: boolean;
  date: Date;
}

interface RaidWeek {
  tue: Date;
  mon: Date;
}

function formatTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(':00', '')
    .replace(' AM', 'am')
    .replace(' PM', 'pm');
}

function crossesMidnight(startDate: Date | null, endDate: Date | null, tz: string): boolean {
  if (!startDate || !endDate) return false;
  const s = getLocalDateParts(startDate, tz);
  const e = getLocalDateParts(endDate, tz);
  return s.year !== e.year || s.month !== e.month || s.day !== e.day;
}

function getCurrentRaidWeek(today: Date): RaidWeek {
  const day = today.getDay();
  const daysFromTue = (day - 2 + 7) % 7;
  const tue = new Date(today);
  tue.setHours(0, 0, 0, 0);
  tue.setDate(tue.getDate() - daysFromTue);
  const mon = new Date(tue);
  mon.setDate(tue.getDate() + 6);
  return { tue, mon };
}

function isInRaidWeek(date: Date, raidWeek: RaidWeek): boolean {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d >= raidWeek.tue && d <= raidWeek.mon;
}

function buildGrid(year: number, month: number): GridCell[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const prevM = month === 0 ? 11 : month - 1;
  const prevY = month === 0 ? year - 1 : year;
  const nextM = month === 11 ? 0 : month + 1;
  const nextY = month === 11 ? year + 1 : year;

  const cells: GridCell[] = [];
  for (let i = 0; i < firstDay; i++) {
    const d = prevMonthDays - firstDay + 1 + i;
    cells.push({ day: d, inMonth: false, date: new Date(prevY, prevM, d) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, date: new Date(year, month, d) });
  }
  const tail = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= tail; i++) {
    cells.push({ day: i, inMonth: false, date: new Date(nextY, nextM, i) });
  }
  return cells;
}

function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 0 && ctx.measureText(s + '…').width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

function drawHeader(ctx: SKRSContext2D, year: number, month: number): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.titleText;
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`${MONTH_NAMES[month]} ${year}`, WIDTH / 2, TITLE_H / 2);

  ctx.fillStyle = COLORS.dayHeader;
  ctx.font = '12px sans-serif';
  DAY_NAMES.forEach((name, i) => {
    ctx.fillText(name, i * CELL_W + CELL_W / 2, TITLE_H + DAY_H / 2);
  });
}

function drawPill(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  event: CalendarEvent,
  timezone: string,
  dim = false,
): void {
  const colors = EVENT_COLORS[event.type];

  ctx.globalAlpha = dim ? 0.35 : 1;

  ctx.fillStyle = colors.bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, PILL_H, 4);
  ctx.fill();

  const startStr = event.scheduledStartAt ? formatTime(event.scheduledStartAt, timezone) : '';
  const crosses = crossesMidnight(event.scheduledStartAt, event.scheduledEndAt, timezone);
  const endStr = event.scheduledEndAt
    ? formatTime(event.scheduledEndAt, timezone) + (crosses ? '+1' : '')
    : '';
  const timeStr = endStr ? `${startStr}-${endStr}` : startStr;

  ctx.fillStyle = colors.text;
  ctx.textBaseline = 'middle';
  const midY = y + PILL_H / 2;

  ctx.font = '10px sans-serif';
  const timeW = ctx.measureText(timeStr).width;
  ctx.fillText(timeStr, x + w - CELL_PAD - timeW, midY);

  const nameMaxW = w - CELL_PAD * 2 - timeW - 6;
  ctx.font = 'bold 11px sans-serif';
  const name = truncateText(ctx, event.name, nameMaxW);
  ctx.fillText(name, x + CELL_PAD, midY);

  if (event.type === 'cancelled') {
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1;
    const nameW = ctx.measureText(name).width;
    ctx.beginPath();
    ctx.moveTo(x + CELL_PAD, midY);
    ctx.lineTo(x + CELL_PAD + nameW, midY);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawCell(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  cell: GridCell,
  events: CalendarEvent[],
  timezone: string,
  today: Date,
  raidWeek: RaidWeek,
): void {
  const { inMonth, day, date } = cell;

  const isToday = date.toDateString() === today.toDateString();
  const isPast = date < today && !isToday;
  const inRaidWeek = isInRaidWeek(date, raidWeek);

  let bg = inMonth ? COLORS.cellBg : COLORS.cellBgOut;
  if (inMonth && inRaidWeek) bg = COLORS.cellBgRaidWeek;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, CELL_W, CELL_H);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1);

  // Circle is drawn behind the text at the same vertical position as non-today dates
  // (textBaseline='top', y+CELL_PAD) so there is no vertical displacement.
  const dateStr = String(day);
  ctx.font = 'bold 13px sans-serif';
  if (isToday) {
    const cx = x + CELL_PAD + TODAY_R;
    const cy = y + CELL_PAD + 6;
    ctx.fillStyle = COLORS.blurple;
    ctx.beginPath();
    ctx.arc(cx, cy, TODAY_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(dateStr, cx, y + CELL_PAD);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = !inMonth ? COLORS.dateNumOut : isPast ? COLORS.dateNumPast : COLORS.dateNum;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(dateStr, x + CELL_PAD, y + CELL_PAD);
  }

  const cellEvents = events.filter((e) => {
    if (!e.scheduledStartAt) return false;
    const { year: ey, month: em, day: ed } = getLocalDateParts(e.scheduledStartAt, timezone);
    return ey === date.getFullYear() && em === date.getMonth() && ed === date.getDate();
  });

  if (cellEvents.length === 0) return;

  const pillsY = y + DATE_AREA_H;
  cellEvents.slice(0, MAX_PILLS).forEach((event, i) => {
    drawPill(ctx, x + CELL_PAD, pillsY + i * (PILL_H + PILL_GAP), CELL_W - CELL_PAD * 2, event, timezone, !inMonth);
  });

  if (cellEvents.length > MAX_PILLS) {
    ctx.globalAlpha = !inMonth ? 0.35 : 1;
    ctx.fillStyle = COLORS.legendText;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`+${cellEvents.length - MAX_PILLS} more`, x + CELL_PAD, pillsY + MAX_PILLS * (PILL_H + PILL_GAP));
    ctx.globalAlpha = 1;
  }
}

function drawLegend(ctx: SKRSContext2D): void {
  const legendY = HEADER_H + ROWS * CELL_H;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, legendY, WIDTH, LEGEND_H);

  const swatchW = 14;
  const swatchH = 10;
  const gap = 6;
  const spacing = 180;
  const ly = legendY + LEGEND_H / 2;

  const items: { color: string; label: string; border?: string }[] = [
    { color: EVENT_COLORS.regular.text, label: 'Regular Raid' },
    { color: EVENT_COLORS.cancelled.text, label: 'Cancelled' },
    { color: EVENT_COLORS.adhoc.text, label: 'Ad-hoc' },
    { color: COLORS.cellBgRaidWeek, label: 'Raid Week', border: COLORS.blurple },
  ];

  const totalW = items.length * spacing;
  let lx = (WIDTH - totalW) / 2;

  ctx.textBaseline = 'middle';
  items.forEach(({ color, label, border }) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(lx, ly - swatchH / 2, swatchW, swatchH, 2);
    ctx.fill();

    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(lx, ly - swatchH / 2, swatchW, swatchH, 2);
      ctx.stroke();
    }

    ctx.fillStyle = COLORS.legendText;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, lx + swatchW + gap, ly);
    lx += spacing;
  });
}

function drawRaidWeekPips(ctx: SKRSContext2D, cells: GridCell[], raidWeek: RaidWeek): void {
  ctx.strokeStyle = COLORS.blurple;
  ctx.lineWidth = 1;
  cells.forEach((cell, i) => {
    if (!cell.inMonth || !isInRaidWeek(cell.date, raidWeek)) return;
    const col = i % 7;
    const row = Math.floor(i / 7);
    const x = col * CELL_W;
    const y = HEADER_H + row * CELL_H;
    const dow = cell.date.getDay();
    if (dow === 2) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y);
      ctx.lineTo(x + 0.5, y + CELL_H);
      ctx.stroke();
    }
    if (dow === 1) {
      ctx.beginPath();
      ctx.moveTo(x + CELL_W + 0.5, y);
      ctx.lineTo(x + CELL_W + 0.5, y + CELL_H);
      ctx.stroke();
    }
  });
}

export function renderMonth(
  year: number,
  month: number,
  events: CalendarEvent[],
  timezone: string,
  today = new Date(),
): Buffer {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawHeader(ctx, year, month);

  const cells = buildGrid(year, month);
  const raidWeek = getCurrentRaidWeek(today);

  cells.forEach((cell, i) => {
    const col = i % 7;
    const row = Math.floor(i / 7);
    drawCell(ctx, col * CELL_W, HEADER_H + row * CELL_H, cell, events, timezone, today, raidWeek);
  });

  drawRaidWeekPips(ctx, cells, raidWeek);
  drawLegend(ctx);

  return canvas.toBuffer('image/png');
}
