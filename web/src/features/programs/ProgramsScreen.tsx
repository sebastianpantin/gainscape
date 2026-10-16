import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import {
  cachedPrograms,
  copyProgram,
  deleteProgram,
  ownPrograms,
  type Program,
  templates,
} from '../../lib/programs/programs.ts';
import { messageOf } from '../../lib/error-text.ts';
import { formatCount } from '../../lib/format.ts';
import { PROGRAM_OFFLINE_TEXT, programErrorText } from '../../lib/programs/program-error-rules.ts';
import { forgetCachedEnrollment } from '../../lib/programs/program-enrollment.ts';
import { isEnrolledIn, isFollowing } from '../../lib/programs/program-follow-rules.ts';
import { programsQuery, publishForEnroll, showChangedPrograms } from '../../lib/query/queries.ts';
import { useIsOffline } from '../../lib/platform/use-online.ts';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_PROGRAMS_NOTICE } from '../../offline/program-list-cache.ts';
import { readProgramCache } from '../../offline/program-cache.ts';
import { PowerliftingPrograms } from './PowerliftingPrograms.tsx';

interface ProgramsScreenProps {
  userId: string;
}

interface PendingDelete {
  program: Program;
  following: boolean;
  cachedEnrollmentInProgram: boolean;
}

function daySummary(program: Program): string {
  return program.days.map((day) => day.name).join(' · ');
}

export function ProgramsScreen({ userId }: ProgramsScreenProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const programList = useQuery(programsQuery(userId));
  const [savedPrograms] = useState(() => cachedPrograms(userId));
  const offline = useIsOffline();
  const offlineId = useId();
  const [actionProblem, setActionProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const pendingCopyIds = useRef(new Map<string, string>());

  const load = programList.data;
  const programs = load?.loaded ?? savedPrograms;
  const savedNotice = load ? cacheFirstNotice(load, OFFLINE_PROGRAMS_NOTICE) : null;
  const problem = actionProblem ?? (load ? null : (programList.error?.message ?? null));

  const copyTemplate = async (template: Program) => {
    setBusy(true);
    setActionProblem(null);
    const newId = pendingCopyIds.current.get(template.id) ?? crypto.randomUUID();
    pendingCopyIds.current.set(template.id, newId);
    try {
      const copiedId = await copyProgram(userId, template.id, newId);
      pendingCopyIds.current.delete(template.id);
      showChangedPrograms(queryClient, userId);
      navigate(`/programs/${copiedId}`);
    } catch (error) {
      setActionProblem(messageOf(error, 'Could not copy the template.'));
      setBusy(false);
    }
  };

  const follow = async (program: Program) => {
    setBusy(true);
    setActionProblem(null);
    try {
      const { key } = await publishForEnroll(queryClient, userId, program.id);
      navigate(`/programs/enroll/${key}`);
    } catch (error) {
      setActionProblem(programErrorText(error));
      setBusy(false);
    }
  };

  const askToRemove = (program: Program) => {
    const { enrollment } = readProgramCache(localStorage, userId);
    setPendingDelete({
      program,
      following: isFollowing(program.id, enrollment),
      cachedEnrollmentInProgram: isEnrolledIn(program.id, enrollment),
    });
  };

  const remove = async ({ program, cachedEnrollmentInProgram }: PendingDelete) => {
    setBusy(true);
    setActionProblem(null);
    try {
      await deleteProgram(userId, program.id);
      if (cachedEnrollmentInProgram) forgetCachedEnrollment(userId);
      showChangedPrograms(queryClient, userId);
    } catch (error) {
      setActionProblem(messageOf(error, 'Could not delete the program.'));
    }
    setPendingDelete(null);
    setBusy(false);
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
      <Link className="back-link" to="/profile">
        ‹ Profile
      </Link>
      <h1 className="title">Programs</h1>
      {savedNotice && (
        <p className="notice" role="status">
          {savedNotice}
        </p>
      )}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <section className="stack" aria-label="Your programs">
        <h2>Your programs</h2>
        {own.length === 0 && <p className="panel muted">Create a program or copy a template.</p>}
        {own.length > 0 && offline && (
          <p className="notice" id={offlineId}>
            {PROGRAM_OFFLINE_TEXT}
          </p>
        )}
        <ul className="stack exercise-list">
          {own.map((program) => (
            <li className="panel row spread" key={program.id}>
              <span>
                {program.name} <span className="muted">{daySummary(program)}</span>
              </span>
              <span className="row">
                <button
                  className="button link"
                  type="button"
                  aria-describedby={offline ? offlineId : undefined}
                  disabled={busy || offline}
                  onClick={() => void follow(program)}
                >
                  Follow
                </button>
                <Link className="button link" to={`/programs/${program.id}`}>
                  Edit
                </Link>
                <button className="button link" type="button" onClick={() => askToRemove(program)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
        <button className="button" type="button" onClick={() => navigate('/programs/new')}>
          New program
        </button>
      </section>
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.program.name}?`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={() => void remove(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        >
          {pendingDelete.following && <p>You're following this program. Deleting it stops following it.</p>}
          <p>Past workouts keep their sets.</p>
        </ConfirmDialog>
      )}
      <PowerliftingPrograms userId={userId} />
      <section className="stack" aria-label="Templates">
        <h2>Templates</h2>
        <ul className="stack exercise-list">
          {templates(programs).map((template) => (
            <li className="panel row spread" key={template.id}>
              <span className="stack" style={{ gap: 2 }}>
                <span>{template.name}</span>
                <span className="muted">
                  {formatCount(template.days.length, 'workout')} · {daySummary(template)}
                </span>
              </span>
              <button className="button" type="button" disabled={busy} onClick={() => copyTemplate(template)}>
                Use {template.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
