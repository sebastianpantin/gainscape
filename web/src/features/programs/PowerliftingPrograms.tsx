import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { templateListEntries, templateScheduleText } from '../../lib/programs/program-enroll-rules.ts';
import { programTemplatesQuery } from '../../lib/query/queries.ts';
import { readProgramCache } from '../../offline/program-cache.ts';

interface PowerliftingProgramsProps {
  userId: string;
}

export function PowerliftingPrograms({ userId }: PowerliftingProgramsProps) {
  const [savedTemplates] = useState(() => readProgramCache(localStorage, userId).templates);
  const live = useQuery(programTemplatesQuery(userId));
  const templates = live.data ?? savedTemplates;
  const failed = live.isError;

  const entries = templateListEntries(templates);

  return (
    <section className="stack" aria-label="Powerlifting programs">
      <h2>Powerlifting programs</h2>
      {failed && entries.length === 0 && (
        <p className="problem" role="alert">
          Couldn't load the powerlifting programs
        </p>
      )}
      <ul className="stack exercise-list">
        {entries.map((entry) => (
          <li className="panel row spread" key={entry.key}>
            {entry.kind === 'enrollable' ? (
              <>
                <span className="stack" style={{ gap: 2 }}>
                  <span>{entry.name}</span>
                  <span className="muted">{templateScheduleText(entry.definition)}</span>
                </span>
                <Link className="button" to={`/programs/enroll/${entry.key}`}>
                  Use {entry.name}
                </Link>
              </>
            ) : (
              <>
                <span>{entry.name}</span>
                <span className="muted">{entry.message}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
