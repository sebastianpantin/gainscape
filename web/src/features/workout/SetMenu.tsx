import { type Ref, useEffect, useId, useRef, useState } from 'react';
import { setMenuPlacement } from './set-menu-rules.ts';

export interface SetMenuAction {
  label: string;
  accessibleName: string;
  pressed?: boolean;
  danger?: boolean;
  onChoose: () => void;
}

interface SetMenuProps {
  name: string;
  actions: readonly SetMenuAction[];
  buttonRef: Ref<HTMLButtonElement>;
}

const ACTION_HEIGHT_PX = 44;
const PANEL_CHROME_PX = 24;

export function SetMenu({ name, actions, buttonRef }: SetMenuProps) {
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => panel.current?.hidePopover();
    window.addEventListener('scroll', close, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [open]);
  const placeBeside = (button: HTMLElement) => {
    const menu = panel.current;
    if (menu === null) return;
    const placement = setMenuPlacement(
      button.getBoundingClientRect(),
      { width: document.documentElement.clientWidth, height: window.innerHeight },
      actions.length * ACTION_HEIGHT_PX + PANEL_CHROME_PX,
    );
    menu.style.top = placement.top === null ? 'auto' : `${placement.top}px`;
    menu.style.bottom = placement.bottom === null ? 'auto' : `${placement.bottom}px`;
    menu.style.right = `${placement.right}px`;
  };
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="button icon set-menu-button"
        popoverTarget={panelId}
        aria-controls={panelId}
        aria-label={name}
        onClick={(event) => placeBeside(event.currentTarget)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      <div
        ref={panel}
        id={panelId}
        popover="auto"
        role="group"
        aria-label={name}
        className="set-menu"
        onToggle={(event) => {
          setOpen(event.newState === 'open');
          if (event.newState === 'open') event.currentTarget.querySelector('button')?.focus({ preventScroll: true });
        }}
      >
        {actions.map(({ label, accessibleName, pressed, danger, onChoose }) => (
          <button
            key={label}
            type="button"
            className={['set-menu-action', pressed ? 'selected' : null, danger ? 'danger' : null]
              .filter((className) => className !== null)
              .join(' ')}
            aria-label={accessibleName}
            aria-pressed={pressed}
            onClick={() => {
              const menu = panel.current;
              if (menu !== null && 'hidePopover' in menu) menu.hidePopover();
              onChoose();
            }}
          >
            {pressed !== undefined && (
              <span className="set-menu-check" aria-hidden="true">
                {pressed ? '✓' : ''}
              </span>
            )}
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
