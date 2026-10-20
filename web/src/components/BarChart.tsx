import { type ChartBar, barChartLayout, barChartSummary } from '../lib/ui/bar-chart-rules.ts';
import { type ChartFrame } from '../lib/ui/line-chart-rules.ts';

interface BarChartProps {
  title: string;
  bars: readonly ChartBar[];
  formatValue: (value: number) => string;
  minYStep?: number;
}

const FRAME: ChartFrame = { width: 320, height: 180, left: 44, right: 16, top: 12, bottom: 24 };

export function BarChart({ title, bars, formatValue, minYStep }: BarChartProps) {
  const layout = barChartLayout(bars, FRAME, { minYStep });
  return (
    <figure className="line-chart">
      <svg
        viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
        role="img"
        aria-label={`${title}. ${barChartSummary(bars, formatValue)}`}
      >
        {layout.yTicks.map((tick) => (
          <g key={tick.value} className="line-chart-grid">
            <line x1={FRAME.left} x2={FRAME.width - FRAME.right} y1={tick.y} y2={tick.y} />
            <text x={FRAME.left - 6} y={tick.y} textAnchor="end" dominantBaseline="middle">
              {formatValue(tick.value)}
            </text>
          </g>
        ))}
        {layout.bars.map((bar, index) => (
          <rect key={index} className="bar-chart-bar" x={bar.x} y={bar.y} width={bar.width} height={bar.height} />
        ))}
        {layout.axisLabels.map((axisLabel, index) => (
          <text
            key={index}
            className="line-chart-axis"
            x={axisLabel.x}
            y={FRAME.height - 6}
            textAnchor={layout.axisLabels.length === 1 ? 'middle' : index === 0 ? 'start' : 'end'}
          >
            {axisLabel.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}
