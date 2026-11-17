export type RowStatus = 'new' | 'historyOnly' | 'imported' | 'deleted' | 'rejected' | 'match' | 'unmapped';

export interface PrototypeRow {
  id: string;
  date: string;
  time: string;
  garminType: string;
  garminLabel: string;
  exercise: string | null;
  durationS: number;
  distanceM: number | null;
  status: RowStatus;
  note: string | null;
}

export const PROTOTYPE_EXERCISES = [
  { key: 'running', name: 'Running' },
  { key: 'walking', name: 'Walking' },
  { key: 'cycling', name: 'Cycling' },
  { key: 'swimming', name: 'Swimming' },
  { key: 'rowing', name: 'Rowing' },
  { key: 'elliptical', name: 'Elliptical' },
  { key: 'stair_climber', name: 'Stair climber' },
  { key: 'hiit_circuit', name: 'HIIT circuit' },
];

export function exerciseName(key: string | null): string {
  return PROTOTYPE_EXERCISES.find((exercise) => exercise.key === key)?.name ?? 'Choose exercise';
}

const TYPE_CYCLE = [
  { garminType: 'running', garminLabel: 'Running', exercise: 'running', durationS: 2710, distanceM: 7420 },
  { garminType: 'running', garminLabel: 'Running', exercise: 'running', durationS: 3242, distanceM: 8251 },
  { garminType: 'walking', garminLabel: 'Walking', exercise: 'walking', durationS: 2400, distanceM: 3100 },
  { garminType: 'running', garminLabel: 'Running', exercise: 'running', durationS: 1810, distanceM: 5020 },
  { garminType: 'lap_swimming', garminLabel: 'Pool swim', exercise: 'swimming', durationS: 1980, distanceM: 1500 },
  {
    garminType: 'indoor_cycling',
    garminLabel: 'Indoor cycling',
    exercise: 'cycling',
    durationS: 2700,
    distanceM: null,
  },
];

const SPECIAL: Record<number, Partial<PrototypeRow>> = {
  0: { status: 'match', note: 'Matches Running logged 16 Nov, 07:10' },
  2: { status: 'imported', note: 'Already imported' },
  3: { garminType: 'hiking', garminLabel: 'Hiking', exercise: 'walking', durationS: 9120, distanceM: 14200 },
  4: {
    garminType: 'paddleboarding',
    garminLabel: 'Stand up paddleboarding',
    exercise: null,
    status: 'unmapped',
    durationS: 3600,
    distanceM: 6100,
  },
  6: { status: 'deleted', note: 'Deleted earlier' },
  9: {
    garminType: 'cycling',
    garminLabel: 'Cycling',
    exercise: 'cycling',
    durationS: 19800,
    distanceM: 152000,
    status: 'rejected',
    note: 'Over 4 h',
  },
  13: {
    garminType: 'bouldering',
    garminLabel: 'Bouldering',
    exercise: null,
    status: 'unmapped',
    durationS: 4500,
    distanceM: null,
  },
  21: {
    garminType: 'open_water_swimming',
    garminLabel: 'Open water swim',
    exercise: 'swimming',
    durationS: 2520,
    distanceM: 1900,
  },
};

const TODAY = Date.UTC(2026, 10, 17);
const DAY_MS = 86_400_000;
const EDIT_WINDOW_DAYS = 7;

function makeRows(): PrototypeRow[] {
  return Array.from({ length: 46 }, (_, index) => {
    const daysAgo = index < 5 ? index + 1 : 5 + (index - 4) * 4;
    const date = new Date(TODAY - daysAgo * DAY_MS);
    const base = TYPE_CYCLE[index % TYPE_CYCLE.length];
    const special = SPECIAL[index] ?? {};
    const status: RowStatus = special.status ?? (daysAgo > EDIT_WINDOW_DAYS ? 'historyOnly' : 'new');
    return {
      id: `activity-${index}`,
      date: date.toISOString().slice(0, 10),
      time: `${String(6 + (index % 12)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}`,
      note: null,
      ...base,
      ...special,
      status,
    };
  });
}

export const PROTOTYPE_ROWS = makeRows();

export function isSelectable(row: PrototypeRow): boolean {
  return row.status === 'new' || row.status === 'historyOnly' || row.status === 'match' || row.status === 'unmapped';
}

export function selectedByDefault(row: PrototypeRow): boolean {
  return row.status === 'new' || row.status === 'historyOnly';
}

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatMonth(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function formatDurationShort(durationS: number): string {
  const hours = Math.floor(durationS / 3600);
  const minutes = Math.round((durationS % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function formatDistanceShort(distanceM: number | null): string | null {
  return distanceM === null ? null : `${(distanceM / 1000).toFixed(1)} km`;
}

export function rowFacts(row: PrototypeRow): string {
  return [formatDurationShort(row.durationS), formatDistanceShort(row.distanceM)].filter(Boolean).join(' · ');
}

export interface ImportResult {
  scored: number;
  historyOnly: number;
  skipped: number;
}

export function resultOf(
  rows: PrototypeRow[],
  selected: Set<string>,
  exercises: Record<string, string | null>,
): ImportResult {
  const chosen = rows.filter((row) => selected.has(row.id) && (exercises[row.id] ?? row.exercise) !== null);
  return {
    scored: chosen.filter((row) => row.status !== 'historyOnly').length,
    historyOnly: chosen.filter((row) => row.status === 'historyOnly').length,
    skipped: rows.length - chosen.length,
  };
}
