import { describe, expect, it } from 'vitest';
import { chartLayout, chartSummary, niceTicks } from '../../web/src/lib/line-chart-rules.ts';

const FRAME = { width: 200, height: 100, left: 20, right: 10, top: 10, bottom: 20 };

describe('nice ticks', () => {
  it('spans the values with round steps of 1, 2 or 5 times a power of ten', () => {
    expect(niceTicks(62, 98, 4)).toEqual([60, 70, 80, 90, 100]);
    expect(niceTicks(0.3, 1.7, 4)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(niceTicks(100, 1900, 4)).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it('widens a single value into a range around it', () => {
    expect(niceTicks(80, 80, 4)).toEqual([79, 79.5, 80, 80.5, 81]);
  });

  it('never steps below the smallest step a whole-number series allows', () => {
    expect(niceTicks(10, 10, 4, 1)).toEqual([9, 10, 11]);
    expect(niceTicks(8, 10, 4, 1)).toEqual([8, 9, 10]);
  });
});

describe('chart layout', () => {
  it('maps the lowest and highest points to the edges of the plot area', () => {
    const layout = chartLayout(
      [
        {
          name: 'e1RM',
          points: [
            { x: 0, y: 60 },
            { x: 10, y: 100 },
          ],
        },
      ],
      FRAME,
    );
    expect(layout.series[0].dots).toEqual([
      { x: 0, y: 60, cx: 20, cy: 80 },
      { x: 10, y: 100, cx: 190, cy: 10 },
    ]);
    expect(layout.series[0].path).toBe('M20 80 L190 10');
    expect(layout.yTicks.map((tick) => tick.value)).toEqual([60, 70, 80, 90, 100]);
    expect(layout.yTicks.map((tick) => tick.y)).toEqual([80, 62.5, 45, 27.5, 10]);
    expect(layout.xTicks).toEqual([
      { value: 0, x: 20 },
      { value: 10, x: 190 },
    ]);
  });

  it('shares one scale across every series', () => {
    const layout = chartLayout(
      [
        { name: 'e1RM', points: [{ x: 0, y: 100 }] },
        {
          name: 'Top set',
          points: [
            { x: 0, y: 60 },
            { x: 5, y: 80 },
          ],
        },
      ],
      FRAME,
    );
    expect(layout.series[0].dots[0]).toMatchObject({ cx: 20, cy: 10 });
    expect(layout.series[1].dots.map((dot) => [dot.cx, dot.cy])).toEqual([
      [20, 80],
      [190, 45],
    ]);
  });

  it('passes the smallest y step on to the ticks', () => {
    const layout = chartLayout([{ name: 'Most reps', points: [{ x: 0, y: 10 }] }], FRAME, { minYStep: 1 });
    expect(layout.yTicks.map((tick) => tick.value)).toEqual([9, 10, 11]);
  });

  it('centres a chart that has a single day', () => {
    const layout = chartLayout([{ name: 'e1RM', points: [{ x: 7, y: 80 }] }], FRAME);
    expect(layout.series[0].dots).toEqual([{ x: 7, y: 80, cx: 105, cy: 45 }]);
    expect(layout.xTicks).toEqual([{ value: 7, x: 105 }]);
  });

  it('has no ticks or lines without points', () => {
    expect(chartLayout([{ name: 'e1RM', points: [] }], FRAME)).toEqual({
      series: [{ name: 'e1RM', path: '', dots: [] }],
      xTicks: [],
      yTicks: [],
    });
  });
});

describe('chart summary', () => {
  const kg = (value: number) => `${value} kg`;

  it('names where each series starts and ends', () => {
    expect(
      chartSummary(
        [
          {
            name: 'e1RM',
            points: [
              { x: 0, y: 70 },
              { x: 1, y: 90 },
              { x: 2, y: 85 },
            ],
          },
          { name: 'Top set', points: [{ x: 0, y: 60 }] },
        ],
        kg,
      ),
    ).toBe('e1RM from 70 kg to 85 kg over 3 points. Top set 60 kg, 1 point.');
  });

  it('leaves out a series with no points', () => {
    expect(chartSummary([{ name: 'e1RM', points: [] }], kg)).toBe('No data yet.');
  });
});
