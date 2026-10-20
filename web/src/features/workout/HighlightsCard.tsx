import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { rarestRecentDrop } from '../../lib/collection/item-rules.ts';
import { capitalized } from '../../lib/names.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { exerciseListQuery, recentDropsQuery, recordTimelineQuery } from '../../lib/query/queries.ts';
import { recentRecords } from '../../lib/stats/pr-timeline-rules.ts';
import { lastWorkoutText } from './highlight-rules.ts';

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

function useLatestRecordText(userId: string, unit: UnitPref): string | null {
  const firstPage = useInfiniteQuery(recordTimelineQuery(userId)).data?.pages[0];
  const exercises = useQuery(exerciseListQuery(userId)).data;
  if (!firstPage || !exercises) return null;
  const [latest] = recentRecords(
    firstPage.loaded,
    new Map(exercises.map((exercise) => [exercise.id, exercise])),
    unit,
    1,
  );
  return latest ? `${latest.text} · ${latest.dateText}` : null;
}

export function HighlightsCard({ userId, today, trainedDates, unit }: HighlightsCardProps) {
  const headingId = useId();
  const lastWorkout = today === null ? null : lastWorkoutText(trainedDates ?? [], today);
  const latestRecord = useLatestRecordText(userId, unit);
  const drops = useQuery(recentDropsQuery(userId)).data;
  const rarest = drops ? rarestRecentDrop(drops) : null;

  const highlights: Highlight[] = [
    ...(lastWorkout ? [{ label: 'Last workout', text: lastWorkout, to: '/collection/stats' }] : []),
    ...(latestRecord ? [{ label: 'Latest record', text: latestRecord, to: '/collection/stats/records' }] : []),
    ...(rarest
      ? [
          {
            label: 'Rarest drop this month',
            text: `${rarest.item.name} · ${capitalized(rarest.item.rarity)}`,
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
