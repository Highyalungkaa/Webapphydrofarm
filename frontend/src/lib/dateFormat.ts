/** Preserve date-only values; convert timestamps to the Bangkok calendar date. */
export function toBangkokDateString(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** Calendar-day difference without mixing a UTC timestamp with a Bangkok date. */
export function differenceInBangkokCalendarDays(start?: string | null, end?: string | null): number | null {
  const startDate = toBangkokDateString(start);
  const endDate = toBangkokDateString(end);
  if (!startDate || !endDate) return null;
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000);
}

/** Add calendar days to a date-only value without depending on the browser time zone. */
export function addCalendarDays(value: string | null | undefined, days: number): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Display dates in day/month/year order while preserving date-only values as local calendar dates. */
export function formatDateDMY(value?: string | null): string {
  if (!value) return '-';
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export function formatDateTimeDMY(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  }).format(date);
}
