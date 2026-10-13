import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { TermHelpRow } from '../../components/TermHelpRow.tsx';
import { PROGRAM_OFFLINE_TEXT, programErrorText } from '../../lib/programs/program-error-rules.ts';
import {
  adjustEnrollment,
  endEnrollment,
  forgetCachedEnrollment,
  refreshProgramFactsOrCached,
} from '../../lib/programs/program-enrollment.ts';
import { referenceEvents, referenceFieldKey, referenceFields } from '../../lib/programs/program-reference-rules.ts';
import { referenceHelpKeys } from '../../lib/ui/term-help-rules.ts';
import { useIsOffline } from '../../lib/platform/use-online.ts';
import { useToast } from '../../lib/ui/toast.ts';
import { ProgramStatusScreen } from './ProgramStatusScreen.tsx';
import { useActiveProgram } from './use-active-program.ts';

interface ActiveProgramScreenProps {
  userId: string;
}

export function ActiveProgramScreen({ userId }: ActiveProgramScreenProps) {
  const navigate = useNavigate();
  const offline = useIsOffline();
  const { cache, program, loadStatus, statusText, showCache } = useActiveProgram(userId);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);

  if (statusText !== null || program.kind === 'none')
    return <ProgramStatusScreen text={statusText} loadStatus={loadStatus} />;

  const title = program.kind === 'template_missing' ? 'Your program' : program.name;
  const fields = program.kind === 'ready' ? referenceFields(program.definition, program.enrollment, program.state) : [];

  const save = async () => {
    if (!cache.enrollment) return;
    const enrollment = cache.enrollment;
    const result = referenceEvents(fields, edited);
    if (result.kind === 'invalid') {
      setProblems(result.problems);
      return;
    }
    setProblems([]);
    setBusy(true);
    let failed = false;
    try {
      for (const event of result.events) await adjustEnrollment(enrollment.id, event);
    } catch (error) {
      failed = true;
      setProblems([programErrorText(error)]);
    } finally {
      showCache(await refreshProgramFactsOrCached(userId, enrollment));
      setEdited({});
      setBusy(false);
    }
    if (!failed) showToast('Saved');
  };

  const stop = async () => {
    if (!cache.enrollment) return;
    setBusy(true);
    try {
      await endEnrollment(cache.enrollment.id);
      forgetCachedEnrollment(userId);
      navigate('/');
    } catch (error) {
      setProblems([programErrorText(error)]);
      setConfirmingStop(false);
      setBusy(false);
    }
  };

  return (
    <main className="screen stack">
      <h1 className="title">{title}</h1>
      {program.kind === 'ready' ? (
        <Link className="standalone-link" to="/programs/active/plan">
          See the plan
        </Link>
      ) : (
        <p className="panel muted">{program.message}</p>
      )}
      {offline && <p className="notice">{PROGRAM_OFFLINE_TEXT}</p>}
      {fields.length > 0 && (
        <section className="panel stack" aria-label="Training weights">
          <h2>Training weights</h2>
          <TermHelpRow keys={referenceHelpKeys(fields)} />
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
                  value={edited[key] ?? (field.value === null ? '' : String(field.value))}
                  onChange={(event) => setEdited({ ...edited, [key]: event.target.value })}
                />
              </label>
            );
          })}
        </section>
      )}
      {problems.length > 0 && (
        <div className="problem" role="alert">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}
      {fields.length > 0 && (
        <button className="button primary big" type="button" disabled={busy || offline} onClick={save}>
          Save changes
        </button>
      )}
      <button
        className="button danger-outline"
        type="button"
        disabled={busy || offline}
        onClick={() => setConfirmingStop(true)}
      >
        Stop following
      </button>
      {confirmingStop && (
        <ConfirmDialog
          title={`Stop following ${title}?`}
          confirmLabel="Stop following"
          danger
          busy={busy}
          onConfirm={stop}
          onCancel={() => setConfirmingStop(false)}
        >
          <p>Your logged workouts stay in your history.</p>
        </ConfirmDialog>
      )}
    </main>
  );
}
