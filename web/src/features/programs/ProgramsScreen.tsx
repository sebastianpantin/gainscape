import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  cachedPrograms,
  copyProgram,
  deleteProgram,
  fetchPrograms,
  ownPrograms,
  type Program,
  templates,
} from '../../lib/programs.ts';

interface ProgramsScreenProps {
  userId: string;
}

function daySummary(program: Program): string {
  return program.days.map((day) => day.name).join(' · ');
}

export function ProgramsScreen({ userId }: ProgramsScreenProps) {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<Program[] | null>(() => cachedPrograms(userId));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingCopyIds = useRef(new Map<string, string>());

  useEffect(() => {
    fetchPrograms(userId).then(setPrograms, (error: Error) => setProblem(error.message));
  }, [userId]);

  const copyTemplate = async (template: Program) => {
    setBusy(true);
    setProblem(null);
    const newId = pendingCopyIds.current.get(template.id) ?? crypto.randomUUID();
    pendingCopyIds.current.set(template.id, newId);
    try {
      const copiedId = await copyProgram(userId, template.id, newId);
      pendingCopyIds.current.delete(template.id);
      navigate(`/programs/${copiedId}`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not copy the template.');
      setBusy(false);
    }
  };

  const remove = async (program: Program) => {
    if (!window.confirm(`Delete ${program.name}? Past workouts keep their sets.`)) return;
    setProblem(null);
    try {
      await deleteProgram(userId, program.id);
      setPrograms(cachedPrograms(userId));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not delete the program.');
    }
  };

  if (!programs)
    return (
      <main className="screen">
        {problem ? (
          <p className="problem" role="alert">
            {problem}
          </p>
        ) : (
          <p>Loading…</p>
        )}
      </main>
    );

  const own = ownPrograms(programs, userId);

  return (
    <main className="screen stack">
      <h1 className="title">Programs</h1>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <section className="stack" aria-label="Your programs">
        <h2>Your programs</h2>
        {own.length === 0 && <p className="panel muted">Copy a template to make your first program.</p>}
        <ul className="stack exercise-list">
          {own.map((program) => (
            <li className="panel row spread" key={program.id}>
              <span>
                {program.name} <span className="muted">{daySummary(program)}</span>
              </span>
              <span className="row">
                <Link className="button link" to={`/programs/${program.id}`}>
                  Edit
                </Link>
                <button className="button link" type="button" onClick={() => remove(program)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="stack" aria-label="Templates">
        <h2>Templates</h2>
        <ul className="stack exercise-list">
          {templates(programs).map((template) => (
            <li className="panel row spread" key={template.id}>
              <span>
                {template.name} <span className="muted">{daySummary(template)}</span>
              </span>
              <button className="button" type="button" disabled={busy} onClick={() => copyTemplate(template)}>
                Use this template
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
