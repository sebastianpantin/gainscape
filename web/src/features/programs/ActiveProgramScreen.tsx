import { useState } from 'react';
import { Link } from 'react-router-dom';
import { messageOf } from '../../lib/error-text.ts';
import { adjustEnrollment, refreshProgramFacts } from '../../lib/program-enrollment.ts';
import { referenceEvents, referenceFieldKey, referenceFields } from '../../lib/program-reference-rules.ts';
import { useActiveProgram } from './use-active-program.ts';

interface ActiveProgramScreenProps {
  userId: string;
}

export function ActiveProgramScreen({ userId }: ActiveProgramScreenProps) {
  const { cache, program, showCache } = useActiveProgram(userId);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  if (program.kind !== 'ready')
    return (
      <main className="screen stack">
        <h1 className="title">{program.kind === 'needs_update' ? program.name : 'Your program'}</h1>
        <p className="panel muted">
          {program.kind === 'needs_update' ? (
            program.message
          ) : (
            <>
              You're not following a program. <Link to="/programs">Pick one</Link>.
            </>
          )}
        </p>
      </main>
    );

  const fields = referenceFields(program.definition, program.enrollment, program.state);

  const save = async () => {
    const result = referenceEvents(fields, edited);
    setSaved(false);
    if (result.kind === 'invalid') {
      setProblems(result.problems);
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      for (const event of result.events) await adjustEnrollment(program.enrollment.id, event);
      if (cache.enrollment) showCache(await refreshProgramFacts(userId, cache.enrollment));
      setEdited({});
      setSaved(true);
    } catch (error) {
      setProblems([messageOf(error, 'Could not save the changes. Check your connection.')]);
    }
    setBusy(false);
  };

  return (
    <main className="screen stack">
      <h1 className="title">{program.name}</h1>
      <section className="panel stack" aria-label="Training weights">
        <h2>Training weights</h2>
        {fields.map((field) => {
          const key = referenceFieldKey(field);
          return (
            <label className="field" key={key}>
              {field.label}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={edited[key] ?? String(field.value)}
                onChange={(event) => setEdited({ ...edited, [key]: event.target.value })}
              />
            </label>
          );
        })}
      </section>
      {problems.length > 0 && (
        <div className="problem" role="alert">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}
      {saved && (
        <p className="notice" role="status">
          Saved
        </p>
      )}
      <button className="button primary big" type="button" disabled={busy} onClick={save}>
        Save changes
      </button>
    </main>
  );
}
