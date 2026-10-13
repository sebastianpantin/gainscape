import { restClock, type RestTimer, restView } from './rest-timer-rules.ts';

const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
const ROUTES_WITHOUT_BAR: readonly string[] = ['/', '/reveal'];

export function showsActiveWorkoutBarOn(pathname: string): boolean {
  return !ROUTES_WITHOUT_BAR.includes(pathname);
}

export type ActiveWorkoutBarView =
  { kind: 'in-progress'; elapsed: string; rest: string | null; name: string } | { kind: 'unsaved'; name: string };

interface ActiveWorkoutBarInput {
  pathname: string;
  draft: { startedAt: string; finishedAt: string | null } | null;
  restTimer: RestTimer | null;
  now: number;
}

export function elapsedClock(elapsedMs: number): string {
  const totalS = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  if (totalS < SECONDS_PER_HOUR) return restClock(totalS);
  const hours = Math.floor(totalS / SECONDS_PER_HOUR);
  return `${hours}:${restClock(totalS % SECONDS_PER_HOUR).padStart(5, '0')}`;
}

function restParts(restTimer: RestTimer | null, now: number): { text: string; name: string } | null {
  const view = restView(restTimer, now);
  if (view.kind === 'resting') {
    const clock = restClock(view.remainingS);
    return { text: `Rest ${clock}`, name: `rest ${clock} left` };
  }
  if (view.kind === 'idle') return null;
  const overClock = restClock(view.overS);
  return { text: `Rest over +${overClock}`, name: `rest over ${overClock} ago` };
}

export function activeWorkoutBar({
  pathname,
  draft,
  restTimer,
  now,
}: ActiveWorkoutBarInput): ActiveWorkoutBarView | null {
  if (draft === null || !showsActiveWorkoutBarOn(pathname)) return null;
  if (draft.finishedAt !== null) return { kind: 'unsaved', name: 'Back to workout, not saved yet' };
  const elapsed = elapsedClock(now - Date.parse(draft.startedAt));
  const rest = restParts(restTimer, now);
  const name = `Back to workout, ${elapsed} elapsed`;
  return { kind: 'in-progress', elapsed, rest: rest?.text ?? null, name: rest ? `${name}, ${rest.name}` : name };
}
