import { type Ref, useId } from 'react';
import { SETS_FULL_TEXT } from './workout-rules.ts';

interface AddSetButtonProps {
  buttonRef: Ref<HTMLButtonElement>;
  roomForSet: boolean;
  onAdd: () => void;
}

export function AddSetButton({ buttonRef, roomForSet, onAdd }: AddSetButtonProps) {
  const fullId = useId();
  return (
    <>
      <button
        ref={buttonRef}
        className="button dashed"
        type="button"
        disabled={!roomForSet}
        aria-describedby={roomForSet ? undefined : fullId}
        onClick={onAdd}
      >
        + Add set
      </button>
      {!roomForSet && (
        <p className="hint" id={fullId}>
          {SETS_FULL_TEXT}
        </p>
      )}
    </>
  );
}
