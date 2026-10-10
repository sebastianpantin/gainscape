import { useQuery } from '@tanstack/react-query';
import { LineChart } from '../../components/LineChart.tsx';
import { bodyweightChartSeries, trendDayText } from '../../lib/bodyweight-trend-rules.ts';
import { messageOf } from '../../lib/error-text.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';
import { bodyweightTrendQuery } from '../../lib/queries.ts';

interface BodyweightTrendProps {
  userId: string;
  unit: UnitPref;
}

export function BodyweightTrend({ userId, unit }: BodyweightTrendProps) {
  const trend = useQuery(bodyweightTrendQuery(userId));

  if (trend.data === undefined) {
    if (!trend.error) return null;
    return (
      <p className="problem" role="alert">
        {messageOf(trend.error, 'Could not load your bodyweight trend.')}
      </p>
    );
  }
  if (trend.data.length === 0) return <p className="muted">Save your bodyweight to start a trend.</p>;
  return (
    <LineChart
      title="Bodyweight over time"
      series={bodyweightChartSeries(trend.data, unit)}
      formatX={trendDayText}
      formatY={(value) => `${value} ${unit}`}
    />
  );
}
