import { type BodySkill, type RecoveryState } from '../lib/progress/recovery-rules.ts';

type Block = readonly [x: number, y: number, width: number, height: number];

const COLS = 20;
const ROWS = 34;
const HEAD: readonly Block[] = [
  [8, 0, 4, 4],
  [9, 4, 2, 1],
];
const LIMBS: Partial<Record<BodySkill, readonly Block[]>> = {
  shoulders: [
    [4, 5, 3, 3],
    [13, 5, 3, 3],
  ],
  arms: [
    [3, 8, 3, 6],
    [14, 8, 3, 6],
  ],
  grip: [
    [2, 14, 3, 5],
    [15, 14, 3, 5],
  ],
  legs: [
    [6, 16, 8, 3],
    [6, 19, 3, 15],
    [11, 19, 3, 15],
  ],
};
const FRONT: Partial<Record<BodySkill, readonly Block[]>> = {
  ...LIMBS,
  chest: [[7, 5, 6, 4]],
  core: [[7, 9, 6, 7]],
};
const BACK: Partial<Record<BodySkill, readonly Block[]>> = {
  ...LIMBS,
  back: [[7, 5, 6, 9]],
  core: [[7, 14, 6, 2]],
};

function Figure({ title, regions, states }: { title: string; regions: typeof FRONT; states: BodyMapProps['states'] }) {
  return (
    <figure className="body-figure">
      <svg viewBox={`0 0 ${COLS} ${ROWS}`} shapeRendering="crispEdges" aria-hidden="true">
        {HEAD.map(([x, y, width, height]) => (
          <rect key={`head-${x}-${y}`} className="body-head" x={x} y={y} width={width} height={height} />
        ))}
        {Object.entries(regions).flatMap(([skill, blocks]) =>
          (blocks ?? []).map(([x, y, width, height]) => (
            <rect
              key={`${skill}-${x}-${y}`}
              className={`body-region ${states[skill as BodySkill]}`}
              x={x}
              y={y}
              width={width}
              height={height}
            />
          )),
        )}
      </svg>
      <figcaption className="muted tiny">{title}</figcaption>
    </figure>
  );
}

interface BodyMapProps {
  states: Readonly<Record<BodySkill, RecoveryState>>;
}

export function BodyMap({ states }: BodyMapProps) {
  return (
    <div className="body-map">
      <Figure title="Front" regions={FRONT} states={states} />
      <Figure title="Back" regions={BACK} states={states} />
    </div>
  );
}
