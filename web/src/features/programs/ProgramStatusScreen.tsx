import { Link } from 'react-router-dom';
import { type ProgramLoadStatus } from '../../lib/programs/program-status-rules.ts';

interface ProgramStatusScreenProps {
  text: string | null;
  loadStatus: ProgramLoadStatus;
}

export function ProgramStatusScreen({ text, loadStatus }: ProgramStatusScreenProps) {
  return (
    <main className="screen stack">
      <h1 className="title">Your program</h1>
      <p className="panel muted">
        {text}
        {loadStatus === 'none' && (
          <>
            {' '}
            <Link to="/programs">Pick a program</Link>
          </>
        )}
      </p>
    </main>
  );
}
