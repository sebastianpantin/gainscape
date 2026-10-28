import { useId } from 'react';
import { Link } from 'react-router-dom';
import { type FeaturedProgram } from '../../lib/programs/program-discovery-rules.ts';

interface FollowProgramCardProps {
  programs: readonly FeaturedProgram[];
  onDismiss: () => void;
}

export function FollowProgramCard({ programs, onDismiss }: FollowProgramCardProps) {
  const headingId = useId();

  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Follow a program</h2>
      <ul className="stack exercise-list">
        {programs.map((program) => (
          <li className="row spread" key={program.key}>
            <span className="stack" style={{ gap: 'var(--space-0-5)' }}>
              <span>{program.name}</span>
              <span className="muted tiny">{program.schedule}</span>
            </span>
            <Link className="button" to={`/programs/enroll/${program.key}`}>
              Follow {program.name}
            </Link>
          </li>
        ))}
      </ul>
      <div className="row spread">
        <Link to="/programs" className="tap-link">
          See all programs
        </Link>
        <button className="button link" type="button" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </section>
  );
}
