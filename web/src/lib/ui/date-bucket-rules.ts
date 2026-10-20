import { MS_PER_DAY } from '@domain/math.ts';

const ISO_DATE_LENGTH = 10;
const ISO_MONTH_LENGTH = 7;

function dayFormat(timeZone: string): Intl.DateTimeFormat {
  const options = { year: 'numeric', month: 'numeric', day: 'numeric' } as const;
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
  }
}

function mondayOnOrBefore(utcMidnight: number): string {
  const daysSinceMonday = (new Date(utcMidnight).getUTCDay() + 6) % 7;
  return new Date(utcMidnight - daysSinceMonday * MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
}

export function weekStartIn(timeZone: string, now: number): string {
  const parts = Object.fromEntries(
    dayFormat(timeZone)
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return mondayOnOrBefore(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

export function weekKey(localDate: string): string {
  return mondayOnOrBefore(Date.parse(`${localDate}T00:00:00Z`));
}

export function monthKey(localDate: string): string {
  return localDate.slice(0, ISO_MONTH_LENGTH);
}
