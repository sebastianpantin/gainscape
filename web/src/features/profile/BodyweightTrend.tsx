import { useEffect, useState } from 'react';
import { LineChart } from '../../components/LineChart.tsx';
import { fetchBodyweightTrend } from '../../lib/bodyweight-trend.ts';
import { bodyweightChartSeries, type BodyweightDay, trendDayText } from '../../lib/bodyweight-trend-rules.ts';
import { messageOf } from '../../lib/error-text.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';

interface BodyweightTrendProps {
  userId: string;
  savedKg: number | null;
  unit: UnitPref;
}

type Loaded = { kind: 'loading' } | { kind: 'problem'; message: string } | { kind: 'ready'; trend: BodyweightDay[] };

export function BodyweightTrend({ userId, savedKg, unit }: BodyweightTrendProps) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchBodyweightTrend(userId, controller.signal).then(
      (trend) => setLoaded({ kind: 'ready', trend }),
      (error: unknown) => {
        if (!controller.signal.aborted)
          setLoaded({ kind: 'problem', message: messageOf(error, 'Could not load your bodyweight trend.') });
      },
    );
    return () => controller.abort();
  }, [userId, savedKg]);

  if (loaded.kind === 'loading') return null;
  if (loaded.kind === 'problem')
    return (
      <p className="problem" role="alert">
        {loaded.message}
      </p>
    );
  if (loaded.trend.length === 0) return <p className="muted">Save your bodyweight to start a trend.</p>;
  return (
    <LineChart
      title="Bodyweight over time"
      series={bodyweightChartSeries(loaded.trend, unit)}
      formatX={trendDayText}
      formatY={(value) => `${value} ${unit}`}
    />
  );
}
