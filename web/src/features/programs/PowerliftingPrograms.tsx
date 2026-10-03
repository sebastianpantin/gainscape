import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProgramTemplates } from '../../lib/program-enrollment.ts';
import { templateListEntries } from '../../lib/program-enroll-rules.ts';
import { readProgramCache, updateProgramCache } from '../../offline/program-cache.ts';

interface PowerliftingProgramsProps {
  userId: string;
}

export function PowerliftingPrograms({ userId }: PowerliftingProgramsProps) {
  const [templates, setTemplates] = useState(() => readProgramCache(localStorage, userId).templates);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchProgramTemplates().then(
      (loaded) => {
        updateProgramCache(localStorage, userId, (cache) => ({ ...cache, templates: loaded }));
        if (active) setTemplates(loaded);
      },
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [userId]);

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
            <span>{entry.name}</span>
            {entry.kind === 'enrollable' ? (
              <Link className="button" to={`/programs/enroll/${entry.key}`}>
                Follow {entry.name}
              </Link>
            ) : (
              <span className="muted">{entry.message}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
