import { useId } from 'react';
import { useModalDialog } from '../../components/use-modal-dialog.ts';
import { type RoutineOffer, type WarmupChoice, warmupChoiceText } from './exercise-card-rules.ts';

interface WarmupChoiceDialogProps {
  liftName: string;
  choices: readonly WarmupChoice[];
  rampSetCount: number;
  routine: RoutineOffer;
  onChoose: (choice: WarmupChoice) => void;
  onCancel: () => void;
}

export function WarmupChoiceDialog({
  liftName,
  choices,
  rampSetCount,
  routine,
  onChoose,
  onCancel,
}: WarmupChoiceDialogProps) {
  const dialog = useModalDialog();
  const id = useId();

  return (
    <dialog
      ref={dialog}
      className="panel stack confirm-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={`${id}-title`}>Warm up for {liftName}</h2>
      {choices.map((choice) => {
        const { label, hint } = warmupChoiceText(choice, rampSetCount, routine);
        return (
          <button
            key={choice}
            className="button warmup-choice"
            type="button"
            aria-describedby={`${id}-${choice}`}
            onClick={() => onChoose(choice)}
          >
            <strong>{label}</strong>
            <span id={`${id}-${choice}`} className="hint" aria-hidden="true">
              {hint}
            </span>
          </button>
        );
      })}
      <button className="button" type="button" onClick={onCancel}>
        Cancel
      </button>
    </dialog>
  );
}
