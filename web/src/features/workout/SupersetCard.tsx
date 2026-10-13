import { Fragment, type ReactNode, type Ref } from 'react';
import { TermHelp } from '../../components/TermHelp.tsx';
import type { RoundCell, RoundRow } from '../../lib/workout/superset-rules.ts';

const NAME_LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

interface SupersetCardProps {
  exerciseNames: readonly string[];
  members: ReactNode;
  rounds: readonly RoundRow[];
  renderCell: (cell: RoundCell, round: number) => ReactNode;
  canAddRound: boolean;
  onAddRound: () => void;
  addRoundRef: Ref<HTMLButtonElement>;
}

export function SupersetCard({
  exerciseNames,
  members,
  rounds,
  renderCell,
  canAddRound,
  onAddRound,
  addRoundRef,
}: SupersetCardProps) {
  return (
    <section
      className="panel stack exercise-card superset-card"
      aria-label={`Superset: ${NAME_LIST.format(exerciseNames)}`}
    >
      <div className="row superset-tag-row">
        <span className="superset-tag tiny">Superset</span>
        <TermHelp glossaryKey="superset" />
      </div>
      {members}
      <ol className="superset-rounds" aria-label="Rounds">
        {rounds.map(({ round, cells }) => (
          <li key={round} className="superset-round" aria-label={`Round ${round}`}>
            <span className="superset-round-title tiny">Round {round}</span>
            <ol className="set-list">
              {cells.map((cell) => (
                <Fragment key={cell.exerciseIndex}>{renderCell(cell, round)}</Fragment>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <button ref={addRoundRef} className="button dashed" type="button" disabled={!canAddRound} onClick={onAddRound}>
        + Add round
      </button>
    </section>
  );
}
