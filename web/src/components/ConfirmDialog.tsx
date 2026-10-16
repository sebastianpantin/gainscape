import { type ReactNode, useEffect, useId, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  children?: ReactNode;
  alternative?: { label: string; onChoose: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  danger = false,
  children,
  alternative,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="panel stack confirm-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <div className="row spread wrap">
        <button className="button" type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        {alternative && (
          <button className="button" type="button" disabled={busy} onClick={alternative.onChoose}>
            {alternative.label}
          </button>
        )}
        <button
          className={danger ? 'button danger' : 'button primary'}
          type="button"
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
