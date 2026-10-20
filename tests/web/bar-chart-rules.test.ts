import { describe, expect, it } from 'vitest';
import { barChartLayout, barChartSummary } from '../../web/src/lib/ui/bar-chart-rules.ts';

const FRAME = { width: 200, height: 100, left: 20, right: 20, top: 10, bottom: 20 };

describe('bar chart layout', () => {
  it('splits the plot width into equal bands and centres a bar in each', () => {
    const layout = barChartLayout(
      [
        { label: 'A', value: 10 },
        { label: 'B', value: 20 },
      ],
      FRAME,
    );
    expect(layout.bars.map((bar) => [bar.x, bar.width])).toEqual([
      [30, 60],
      [110, 60],
    ]);
  });

  it('grows every bar up from zero on one shared scale', () => {
    const layout = barChartLayout(
      [
        { label: 'A', value: 10 },
        { label: 'B', value: 20 },
      ],
      FRAME,
    );
    expect(layout.yTicks.map((tick) => tick.value)).toEqual([0, 5, 10, 15, 20]);
    expect(layout.yTicks.map((tick) => tick.y)).toEqual([80, 62.5, 45, 27.5, 10]);
    expect(layout.bars.map((bar) => [bar.y, bar.height])).toEqual([
      [45, 35],
      [10, 70],
    ]);
  });

  it('gives a zero bar no height and keeps a scale when every bar is zero', () => {
    const layout = barChartLayout(
      [
        { label: 'A', value: 0 },
        { label: 'B', value: 0 },
      ],
      FRAME,
    );
    expect(layout.bars.map((bar) => bar.height)).toEqual([0, 0]);
    expect(layout.yTicks[0]).toEqual({ value: 0, y: 80 });
    expect(layout.yTicks.length).toBeGreaterThan(1);
  });

  it('passes the smallest y step on to the ticks', () => {
    const layout = barChartLayout([{ label: 'A', value: 2 }], FRAME, { minYStep: 1 });
    expect(layout.yTicks.map((tick) => tick.value)).toEqual([0, 1, 2]);
  });

  it('labels the axis with the first and the last bar', () => {
    const layout = barChartLayout(
      [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
        { label: 'C', value: 3 },
      ],
      { ...FRAME, left: 20, right: 30 },
    );
    expect(layout.axisLabels).toEqual([
      { label: 'A', x: 45 },
      { label: 'C', x: 145 },
    ]);
    expect(barChartLayout([{ label: 'A', value: 1 }], FRAME).axisLabels).toEqual([{ label: 'A', x: 100 }]);
  });

  it('has no bars, ticks or labels without data', () => {
    expect(barChartLayout([], FRAME)).toEqual({ bars: [], yTicks: [], axisLabels: [] });
  });
});

describe('bar chart summary', () => {
  const sets = (value: number) => `${value} sets`;

  it('reads every bar with its value in order', () => {
    expect(
      barChartSummary(
        [
          { label: 'Week of 5 Oct', value: 8 },
          { label: 'Week of 12 Oct', value: 12 },
        ],
        sets,
      ),
    ).toBe('Week of 5 Oct 8 sets, Week of 12 Oct 12 sets.');
  });

  it('says there is nothing to show without bars', () => {
    expect(barChartSummary([], sets)).toBe('No data yet.');
  });
});
