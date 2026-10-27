import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { capitalized } from '../../lib/names.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import {
  exerciseListQuery,
  lastWorkoutDateQuery,
  rarestDropQuery,
  recordTimelineQuery,
} from '../../lib/query/queries.ts';
import { recentRecords } from '../../lib/stats/pr-timeline-rules.ts';
import { lastWorkoutText, latestTrainedDate } from './highlight-rules.ts';

interface Highlight {
  label: string;
  text: string;
  to: string;
}

interface HighlightsCardProps {
  userId: string;
  today: string | null;
  trainedDates: readonly string[] | undefined;
  unit: UnitPref;
}

function useLastWorkoutText(userId: string, today: string | null, trainedDates: readonly string[] | undefined) {
  const lapsed = today !== null && trainedDates !== undefined && latestTrainedDate(trainedDates, today) === null;
  const olderWorkout = useQuery({ ...lastWorkoutDateQuery(userId, today ?? ''), enabled: lapsed }).data ?? null;
  if (today === null || trainedDates === undefined) return null;
  return lastWorkoutText(trainedDates, today, lapsed ? olderWorkout : null);
}

function useLatestRecordText(userId: string, unit: UnitPref): string | null {
  const records = useInfiniteQuery(recordTimelineQuery(userId)).data?.pages[0]?.loaded;
  const exercises = useQuery({ ...exerciseListQuery(userId), enabled: records !== undefined && records.length > 0 });
  if (!records || !exercises.data) return null;
  const [latest] = recentRecords(records, new Map(exercises.data.map((exercise) => [exercise.id, exercise])), unit, 1);
  return latest ? `${latest.text} · ${latest.dateText}` : null;
}

export function HighlightsCard({ userId, today, trainedDates, unit }: HighlightsCardProps) {
  const headingId = useId();
  const lastWorkout = useLastWorkoutText(userId, today, trainedDates);
  const latestRecord = useLatestRecordText(userId, unit);
  const rarest = useQuery(rarestDropQuery(userId)).data;

  const highlights: Highlight[] = [
    ...(lastWorkout ? [{ label: 'Last workout', text: lastWorkout, to: '/collection/stats' }] : []),
    ...(latestRecord ? [{ label: 'Latest record', text: latestRecord, to: '/collection/stats/records' }] : []),
    ...(rarest
      ? [
          {
            label: 'Rarest drop, last 30 days',
            text: `${rarest.name} · ${capitalized(rarest.rarity)}`,
            to: '/collection/items',
          },
        ]
      : []),
  ];
  if (highlights.length === 0) return null;
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Highlights</h2>
      <ul className="highlight-list">
        {highlights.map(({ label, text, to }) => (
          <li key={label}>
            <Link className="highlight-row" to={to}>
              <span className="muted tiny">{label}</span>
              <span>{text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
