import { useEffect, useState } from 'react';
import { cachedPrograms, fetchPrograms, ownPrograms, type Program, type ProgramDay } from '../../lib/programs.ts';
import { programLabelFor } from '../../offline/draft-format.ts';

interface ProgramDayStartsProps {
  userId: string;
  disabled: boolean;
  onStart: (program: Program, day: ProgramDay) => void;
}

export function ProgramDayStarts({ userId, disabled, onStart }: ProgramDayStartsProps) {
  const [programs, setPrograms] = useState<Program[] | null>(() => cachedPrograms(userId));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchPrograms(userId).then(
      (loaded) => active && setPrograms(loaded),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  if (!programs)
    return failed ? (
      <p className="problem" role="alert">
        Couldn't load your programs
      </p>
    ) : null;

  return (
    <>
      {ownPrograms(programs, userId).flatMap((program) =>
        program.days.map((day) => (
          <button
            key={day.id}
            className="button big"
            type="button"
            disabled={disabled}
            onClick={() => onStart(program, day)}
          >
            {programLabelFor(program.name, day.name)}
          </button>
        )),
      )}
    </>
  );
}
