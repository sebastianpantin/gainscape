import { GLOSSARY, type GlossaryKey } from '../lib/ui/glossary.ts';
import { TermHelp } from './TermHelp.tsx';

interface TermHelpRowProps {
  keys: readonly GlossaryKey[];
}

export function TermHelpRow({ keys }: TermHelpRowProps) {
  if (keys.length === 0) return null;
  return (
    <div className="term-help-row">
      {keys.map((key) => (
        <div key={key} className="term-help-pair">
          {GLOSSARY[key].term}
          <TermHelp glossaryKey={key} />
        </div>
      ))}
    </div>
  );
}
