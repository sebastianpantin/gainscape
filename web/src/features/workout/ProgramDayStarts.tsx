import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { cachedPrograms, ownPrograms, type Program, type ProgramDay } from '../../lib/programs/programs.ts';
import { programsQuery } from '../../lib/query/queries.ts';
import { programLabelFor } from '../../offline/draft-starts.ts';

interface ProgramDayStartsProps {
  userId: string;
  disabled: boolean;
  followingProgram: boolean;
  onStart: (program: Program, day: ProgramDay) => void;
}

function exerciseCount(day: ProgramDay): string {
  return day.exercises.length === 1 ? '1 exercise' : `${day.exercises.length} exercises`;
}

export function ProgramDayStarts({ userId, disabled, followingProgram, onStart }: ProgramDayStartsProps) {
  const programList = useQuery(programsQuery(userId));
  const [savedPrograms] = useState(() => cachedPrograms(userId));
  const programs = programList.data?.loaded ?? savedPrograms;
  const failed = programList.isError;

  if (!programs)
    return failed ? (
      <p className="problem" role="alert">
        Couldn't load your programs
      </p>
    ) : null;

  const own = ownPrograms(programs, userId);
  if (own.length === 0 && followingProgram) return null;

  return (
    <div className="panel stack">
      <div className="row spread">
        <h2>Program days</h2>
        <Link to="/programs" className="tiny">
          Edit programs
        </Link>
      </div>
      {own.length === 0 ? (
        <p className="muted">
          No programs yet. <Link to="/programs">Copy a template</Link> to plan your days.
        </p>
      ) : (
        <ul className="day-list">
          {own.flatMap((program) =>
            program.days.map((day) => (
              <li key={day.id}>
                <button
                  className="button day-button"
                  type="button"
                  disabled={disabled}
                  onClick={() => onStart(program, day)}
                >
                  <span className="stack" style={{ gap: 2 }}>
                    <span>{programLabelFor(program.name, day.name)}</span>
                    <span className="muted tiny">{exerciseCount(day)}</span>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            )),
          )}
        </ul>
      )}
    </div>
  );
}
