import { roundTo } from '@domain/math.ts';

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  name: string;
  points: readonly ChartPoint[];
}

export interface ChartFrame {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlottedPoint extends ChartPoint {
  cx: number;
  cy: number;
}

export interface PlottedSeries {
  name: string;
  path: string;
  dots: PlottedPoint[];
}

export interface ChartLayout {
  series: PlottedSeries[];
  xTicks: { value: number; x: number }[];
  yTicks: { value: number; y: number }[];
}

const TICK_DECIMALS = 10;
const SINGLE_VALUE_SPREAD = 1;

function niceStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function niceTicks(min: number, max: number, count: number, minStep = 0): number[] {
  const [low, high] = min === max ? [min - SINGLE_VALUE_SPREAD, max + SINGLE_VALUE_SPREAD] : [min, max];
  const step = Math.max(minStep, niceStep((high - low) / count));
  const first = Math.floor(low / step);
  const last = Math.ceil(high / step);
  return Array.from({ length: last - first + 1 }, (_, index) => roundTo(TICK_DECIMALS, (first + index) * step));
}

function scale(domainLow: number, domainHigh: number, rangeLow: number, rangeHigh: number) {
  if (domainLow === domainHigh) return () => roundTo(TICK_DECIMALS, (rangeLow + rangeHigh) / 2);
  return (value: number) =>
    roundTo(TICK_DECIMALS, rangeLow + ((value - domainLow) / (domainHigh - domainLow)) * (rangeHigh - rangeLow));
}

export interface ChartScaleOptions {
  yTickCount?: number;
  minYStep?: number;
}

export function chartLayout(
  series: readonly ChartSeries[],
  frame: ChartFrame,
  { yTickCount = 4, minYStep = 0 }: ChartScaleOptions = {},
): ChartLayout {
  const points = series.flatMap((line) => line.points);
  if (points.length === 0) {
    return { series: series.map((line) => ({ name: line.name, path: '', dots: [] })), xTicks: [], yTicks: [] };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const yTickValues = niceTicks(Math.min(...ys), Math.max(...ys), yTickCount, minYStep);
  const [xLow, xHigh] = [Math.min(...xs), Math.max(...xs)];
  const toX = scale(xLow, xHigh, frame.left, frame.width - frame.right);
  const toY = scale(yTickValues[0], yTickValues[yTickValues.length - 1], frame.height - frame.bottom, frame.top);
  return {
    series: series.map((line) => {
      const dots = line.points.map((point) => ({ ...point, cx: toX(point.x), cy: toY(point.y) }));
      return {
        name: line.name,
        path: dots.map((dot, index) => `${index === 0 ? 'M' : 'L'}${dot.cx} ${dot.cy}`).join(' '),
        dots,
      };
    }),
    xTicks: [...new Set([xLow, xHigh])].map((value) => ({ value, x: toX(value) })),
    yTicks: yTickValues.map((value) => ({ value, y: toY(value) })),
  };
}

function seriesSummary({ name, points }: ChartSeries, formatY: (y: number) => string): string | null {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  if (points.length === 1) return `${name} ${formatY(first.y)}, 1 point.`;
  return `${name} from ${formatY(first.y)} to ${formatY(last.y)} over ${points.length} points.`;
}

export function chartSummary(series: readonly ChartSeries[], formatY: (y: number) => string): string {
  const parts = series.flatMap((line) => seriesSummary(line, formatY) ?? []);
  return parts.length === 0 ? 'No data yet.' : parts.join(' ');
}
