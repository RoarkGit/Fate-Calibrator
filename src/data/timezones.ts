interface TimezoneEntry {
  value: string;
  label: string;
  search: string;
}

const TIMEZONES: TimezoneEntry[] = [
  // North America
  { value: 'America/New_York',    label: 'Eastern Time (ET)',          search: 'eastern et est edt new york nyc toronto montreal' },
  { value: 'America/Chicago',     label: 'Central Time (CT)',          search: 'central ct cst cdt chicago dallas houston minneapolis' },
  { value: 'America/Denver',      label: 'Mountain Time (MT)',         search: 'mountain mt mst mdt denver salt lake city' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)',          search: 'pacific pt pst pdt los angeles seattle portland san francisco la' },
  { value: 'America/Phoenix',     label: 'Arizona - no DST (MST)',     search: 'arizona phoenix mst no dst' },
  { value: 'America/Anchorage',   label: 'Alaska Time (AKT)',          search: 'alaska akt akst akdt anchorage' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii Time (HST)',          search: 'hawaii hst honolulu' },
  { value: 'America/Halifax',     label: 'Atlantic Time (AT)',         search: 'atlantic at ast adt halifax nova scotia' },
  { value: 'America/St_Johns',    label: 'Newfoundland Time (NT)',     search: 'newfoundland nst ndt st johns' },
  { value: 'America/Sao_Paulo',   label: 'Brasília Time (BRT)',       search: 'brazil brasil brasilia brt sao paulo' },
  // Europe
  { value: 'Europe/London',       label: 'London (GMT/BST)',           search: 'london gmt bst uk britain england ireland dublin' },
  { value: 'Europe/Paris',        label: 'Central European (CET)',     search: 'cet cest paris berlin amsterdam rome madrid brussels europe central warsaw poland polish copenhagen denmark danish stockholm sweden swedish oslo norway norwegian vienna austria prague czech czechia budapest hungary zurich switzerland bern' },
  { value: 'Europe/Helsinki',     label: 'Eastern European (EET)',     search: 'eet eest helsinki tallinn riga vilnius athens bucharest sofia bulgaria kyiv ukraine' },
  { value: 'Europe/Moscow',       label: 'Moscow Time (MSK)',          search: 'moscow msk russia' },
  { value: 'Europe/Istanbul',     label: 'Turkey Time (TRT)',          search: 'turkey istanbul trt' },
  // Africa
  { value: 'Africa/Johannesburg', label: 'South Africa (SAST)',        search: 'south africa sast johannesburg cape town' },
  { value: 'Africa/Cairo',        label: 'Egypt (EET)',                search: 'egypt cairo eet' },
  // Middle East / Asia
  { value: 'Asia/Dubai',          label: 'Gulf Time (GST)',            search: 'dubai gulf uae gst' },
  { value: 'Asia/Kolkata',        label: 'India (IST)',                search: 'india ist kolkata mumbai delhi' },
  { value: 'Asia/Bangkok',        label: 'Indochina Time (ICT)',       search: 'thailand bangkok ict vietnam hanoi' },
  { value: 'Asia/Singapore',      label: 'Singapore / Malaysia (SGT)', search: 'singapore malaysia sgt kuala lumpur' },
  { value: 'Asia/Hong_Kong',      label: 'Hong Kong (HKT)',            search: 'hong kong hkt' },
  { value: 'Asia/Shanghai',       label: 'China Standard (CST)',       search: 'china cst shanghai beijing' },
  { value: 'Asia/Tokyo',          label: 'Japan (JST)',                search: 'japan jst tokyo' },
  { value: 'Asia/Seoul',          label: 'Korea (KST)',                search: 'korea kst seoul' },
  // Oceania
  { value: 'Australia/Perth',     label: 'Western Australia (AWST)',   search: 'perth awst western australia' },
  { value: 'Australia/Adelaide',  label: 'South Australia (ACST)',     search: 'adelaide acst south australia' },
  { value: 'Australia/Sydney',    label: 'Eastern Australia (AEST)',   search: 'sydney aest aedst melbourne brisbane eastern australia' },
  { value: 'Pacific/Auckland',    label: 'New Zealand (NZST)',         search: 'new zealand nzst nzdt auckland wellington' },
  // UTC
  { value: 'UTC',                 label: 'UTC',                        search: 'utc gmt universal' },
];

export function searchTimezones(query: string): TimezoneEntry[] {
  if (!query) return TIMEZONES.slice(0, 25);
  const q = query.toLowerCase().trim();
  return TIMEZONES.filter(
    (tz) => tz.label.toLowerCase().includes(q) || tz.value.toLowerCase().includes(q) || tz.search.includes(q),
  ).slice(0, 25);
}

export function formatChoice(tz: TimezoneEntry): { name: string; value: string } {
  const now = new Intl.DateTimeFormat('en-US', {
    timeZone: tz.value,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(new Date());
  return { name: `${tz.label} ${now}`, value: tz.value };
}
