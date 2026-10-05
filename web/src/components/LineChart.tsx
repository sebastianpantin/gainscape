import { type ChartFrame, chartLayout, type ChartSeries, chartSummary } from '../lib/line-chart-rules.ts';

interface LineChartProps {
  title: string;
  series: readonly ChartSeries[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
}

const FRAME: ChartFrame = { width: 320, height: 180, left: 44, right: 16, top: 12, bottom: 24 };
const DOT_RADIUS = 3;

export function LineChart({ title, series, formatX, formatY }: LineChartProps) {
  const layout = chartLayout(series, FRAME);
  return (
    <figure className="line-chart">
      <svg
        viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
        role="img"
        aria-label={`${title}. ${chartSummary(series, formatY)}`}
      >
        {layout.yTicks.map((tick) => (
          <g key={tick.value} className="line-chart-grid">
            <line x1={FRAME.left} x2={FRAME.width - FRAME.right} y1={tick.y} y2={tick.y} />
            <text x={FRAME.left - 6} y={tick.y} textAnchor="end" dominantBaseline="middle">
              {formatY(tick.value)}
            </text>
          </g>
        ))}
        {layout.xTicks.map((tick, index) => (
          <text
            key={tick.value}
            className="line-chart-axis"
            x={tick.x}
            y={FRAME.height - 6}
            textAnchor={layout.xTicks.length === 1 ? 'middle' : index === 0 ? 'start' : 'end'}
          >
            {formatX(tick.value)}
          </text>
        ))}
        {layout.series.map((line, index) => (
          <g key={line.name} className={`line-chart-series series-${index}`}>
            <path d={line.path} />
            {line.dots.map((dot, dotIndex) => (
              <circle key={dotIndex} cx={dot.cx} cy={dot.cy} r={DOT_RADIUS} />
            ))}
          </g>
        ))}
      </svg>
      <figcaption>
        <ul className="line-chart-legend">
          {series.map((line, index) => (
            <li key={line.name}>
              <span className={`line-chart-swatch series-${index}`} aria-hidden="true" />
              {line.name}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
