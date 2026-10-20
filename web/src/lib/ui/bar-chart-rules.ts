import { roundTo } from '@domain/math.ts';
import { type ChartFrame, niceTicks } from './line-chart-rules.ts';

export interface ChartBar {
  label: string;
  value: number;
}

interface PlottedBar extends ChartBar {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BarChartLayout {
  bars: PlottedBar[];
  yTicks: { value: number; y: number }[];
  axisLabels: { label: string; x: number }[];
}

interface BarChartScaleOptions {
  yTickCount?: number;
  minYStep?: number;
}

const TICK_DECIMALS = 10;
const BAR_GAP_FRACTION = 0.25;
const EMPTY_SCALE_TOP = 1;

export function barChartLayout(
  bars: readonly ChartBar[],
  frame: ChartFrame,
  { yTickCount = 4, minYStep = 0 }: BarChartScaleOptions = {},
): BarChartLayout {
  if (bars.length === 0) return { bars: [], yTicks: [], axisLabels: [] };
  const peak = Math.max(...bars.map((bar) => bar.value));
  const yTickValues = niceTicks(0, peak > 0 ? peak : EMPTY_SCALE_TOP, yTickCount, minYStep);
  const baseline = frame.height - frame.bottom;
  const plotHeight = baseline - frame.top;
  const scaleTop = yTickValues[yTickValues.length - 1];
  const toY = (value: number) => roundTo(TICK_DECIMALS, baseline - (value / scaleTop) * plotHeight);
  const band = (frame.width - frame.left - frame.right) / bars.length;
  const width = roundTo(TICK_DECIMALS, band * (1 - BAR_GAP_FRACTION));
  const bandStart = (index: number) => frame.left + index * band;
  const plotted = bars.map((bar, index) => {
    const y = toY(bar.value);
    return {
      ...bar,
      x: roundTo(TICK_DECIMALS, bandStart(index) + (band - width) / 2),
      y,
      width,
      height: roundTo(TICK_DECIMALS, baseline - y),
    };
  });
  const labelledIndexes = [...new Set([0, bars.length - 1])];
  return {
    bars: plotted,
    yTicks: yTickValues.map((value) => ({ value, y: toY(value) })),
    axisLabels: labelledIndexes.map((index) => ({
      label: bars[index].label,
      x: roundTo(TICK_DECIMALS, bandStart(index) + band / 2),
    })),
  };
}

export function barChartSummary(bars: readonly ChartBar[], formatValue: (value: number) => string): string {
  if (bars.length === 0) return 'No data yet.';
  return `${bars.map((bar) => `${bar.label} ${formatValue(bar.value)}`).join(', ')}.`;
}
