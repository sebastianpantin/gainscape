import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';

export function DiscardWorkoutDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      title="Discard this workout?"
      confirmLabel="Discard workout"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>Your logged sets will be lost.</p>
    </ConfirmDialog>
  );
}
