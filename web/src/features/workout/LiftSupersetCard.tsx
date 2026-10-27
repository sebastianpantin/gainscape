import { addRound, canAddRound, roundRows, type SupersetGroup } from '../../lib/workout/superset-rules.ts';
import { type LiftCardContext } from './lift-card-context.ts';
import { LiftExerciseIntro } from './LiftExerciseIntro.tsx';
import { backoffSuggestion } from '../../lib/workout/backoff-rules.ts';
import { LiftSetRow } from './LiftSetRow.tsx';
import { SupersetCard } from './SupersetCard.tsx';
import { supersetMembers } from './workout-screen-rules.ts';

interface LiftSupersetCardProps {
  group: SupersetGroup;
  lift: LiftCardContext;
}

export function LiftSupersetCard({ group, lift }: LiftSupersetCardProps) {
  const { draft, actions } = lift;
  const members = supersetMembers(draft, group);
  const backoffs = new Map(members.map(({ exercise }) => [exercise.clientId, backoffSuggestion(exercise, lift.unit)]));
  return (
    <SupersetCard
      exerciseNames={members.map(({ exercise }) => exercise.name)}
      members={members.map(({ index, exercise }) => (
        <div className="stack superset-member" key={exercise.clientId}>
          <LiftExerciseIntro exercise={exercise} exerciseIndex={index} lift={lift} />
        </div>
      ))}
      rounds={roundRows(draft, group)}
      renderCell={(cell, round) => {
        const member = members.find(({ index }) => index === cell.exerciseIndex)?.exercise;
        if (member === undefined) return null;
        const setIndex = member.sets.findIndex((set) => set.id === cell.setId);
        if (setIndex === -1)
          return <li className="superset-gap muted tiny">{`No ${member.name} set in round ${round}`}</li>;
        return (
          <LiftSetRow
            key={member.sets[setIndex].id}
            exercise={member}
            exerciseIndex={cell.exerciseIndex}
            set={member.sets[setIndex]}
            setIndex={setIndex}
            lift={lift}
            backoff={backoffs.get(member.clientId) ?? null}
            doneLabel={`Done ${member.name} round ${round}`}
            rowLabel={`${member.name}, set ${setIndex + 1}`}
          />
        );
      }}
      canAddRound={canAddRound(draft, group)}
      onAddRound={() => actions.changeDraft(addRound(draft, group))}
      addRoundRef={actions.focusTarget(`superset-${group.id}`)}
    />
  );
}
