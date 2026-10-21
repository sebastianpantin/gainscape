import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { featuredPrograms } from '../../lib/programs/program-discovery-rules.ts';
import { templateListEntries } from '../../lib/programs/program-enroll-rules.ts';
import { programTemplatesQuery } from '../../lib/query/queries.ts';
import { readProgramCache } from '../../offline/program-cache.ts';

interface FollowProgramCardProps {
  userId: string;
  onDismiss: () => void;
}

export function FollowProgramCard({ userId, onDismiss }: FollowProgramCardProps) {
  const headingId = useId();
  const [savedTemplates] = useState(() => readProgramCache(localStorage, userId).templates);
  const live = useQuery(programTemplatesQuery(userId));
  const programs = featuredPrograms(templateListEntries(live.data ?? savedTemplates));

  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Follow a program</h2>
      <ul className="stack exercise-list">
        {programs.map((program) => (
          <li className="row spread" key={program.key}>
            <span className="stack" style={{ gap: 2 }}>
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
