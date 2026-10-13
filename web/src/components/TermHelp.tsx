import { useId } from 'react';
import { GLOSSARY, type GlossaryKey } from '../lib/ui/glossary.ts';

interface TermHelpProps {
  glossaryKey: GlossaryKey;
}

export function TermHelp({ glossaryKey }: TermHelpProps) {
  const panelId = useId();
  const entry = GLOSSARY[glossaryKey];
  return (
    <>
      <button
        type="button"
        className="term-help"
        popoverTarget={panelId}
        aria-controls={panelId}
        aria-label={entry.question}
      >
        <span className="term-help-glyph" aria-hidden="true">
          ?
        </span>
      </button>
      <div id={panelId} popover="auto" className="term-help-panel">
        <p>{entry.definition}</p>
        <button type="button" className="button" popoverTarget={panelId} popoverTargetAction="hide">
          Got it
        </button>
      </div>
    </>
  );
}
