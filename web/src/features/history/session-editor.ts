import type { RevokedDrop } from '@domain/types.ts';
import { type Exercise, isLiftExercise } from '../../lib/catalog-rules.ts';
import type { InvokeOutcome } from '../../lib/function-client-rules.ts';
import type { EditSessionPayload } from '../../lib/history-rules.ts';
import {
  editPayload,
  type FailureAction,
  failureAction,
  failureText,
  savedEdit,
  type SessionEdit,
  summariesToForget,
  withNewSetIds,
  withoutBodyweightLoads,
} from './session-edit.ts';

const SET_ID_RETRIES = 2;
const CONFLICT_RELOAD_FAILED_TEXT =
  "This workout was changed on another device, and the latest version couldn't be loaded.";
const SAVED_RELOAD_FAILED_TEXT = "Saved, but couldn't refresh the workout.";
const BODYWEIGHT_LOAD_RESET_TEXT =
  "Bodyweight-only exercises can't carry added weight, so it was reset to 0. Check the sets and save again.";

export type SessionProblem<Fresh> =
  | { kind: 'conflict'; fresh: Fresh }
  | { kind: 'bodyweight'; pending: SessionEdit }
  | { kind: 'unknown_exercise'; exerciseIds: string[] }
  | { kind: 'refresh_failed'; text: string; retry: () => void }
  | { kind: 'message'; text: string };

export type SessionBusy = { kind: 'idle' } | { kind: 'saving' | 'deleting'; retrying: string | null };

export const IDLE: SessionBusy = { kind: 'idle' };

export type SessionEditorChange<Fresh> =
  | { kind: 'busy'; busy: SessionBusy }
  | { kind: 'problem'; problem: SessionProblem<Fresh> | null }
  | { kind: 'notice'; notice: string | null }
  | { kind: 'edit'; edit: SessionEdit }
  | { kind: 'saved'; saved: SessionEdit }
  | { kind: 'adopt'; fresh: Fresh }
  | { kind: 'read_only' }
  | { kind: 'delete_settled' }
  | { kind: 'deleted'; notice: string }
  | { kind: 'gone' }
  | { kind: 'sign_out' };

interface ChangedSessions {
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

type OnRetry = (reason: string) => void;

export interface SessionEditorPorts<Fresh> {
  sessionId: string;
  signal: () => AbortSignal;
  editSession: (
    payload: EditSessionPayload,
    signal: AbortSignal,
    onRetry: OnRetry,
  ) => Promise<InvokeOutcome<ChangedSessions & { revision: number }>>;
  deleteSession: (
    payload: { sessionId: string; ifRevision: number },
    signal: AbortSignal,
    onRetry: OnRetry,
  ) => Promise<InvokeOutcome<ChangedSessions>>;
  loadSession: () => Promise<Fresh | null>;
  latestExercises: () => Promise<readonly Exercise[]>;
  rememberedSummaryId: () => string | undefined;
  forgetSummaries: (sessionIds: string[]) => void;
  forgetDeletedSession: () => void;
  describeRevoked: (drops: readonly RevokedDrop[]) => string;
  apply: (change: SessionEditorChange<Fresh>) => void;
}

export interface SessionEditor {
  save: (toSend: SessionEdit) => Promise<void>;
  remove: (ifRevision: number) => Promise<void>;
}

function withRemoved(text: string, removed: string): string {
  return removed ? `${text} ${removed}` : text;
}

export function createSessionEditor<Fresh>(ports: SessionEditorPorts<Fresh>): SessionEditor {
  const { sessionId, apply } = ports;
  const showProblem = (problem: SessionProblem<Fresh> | null) => apply({ kind: 'problem', problem });

  const reloadSession = async (
    signal: AbortSignal,
    failedText: string,
    onFresh: (fresh: Fresh) => void,
  ): Promise<void> => {
    let fresh: Fresh | null;
    try {
      fresh = await ports.loadSession();
    } catch {
      if (signal.aborted) return;
      showProblem({
        kind: 'refresh_failed',
        text: failedText,
        retry: () => void reloadSession(signal, failedText, onFresh),
      });
      return;
    }
    if (signal.aborted) return;
    if (!fresh) return apply({ kind: 'gone' });
    onFresh(fresh);
  };

  const handleCommonFailure = (action: FailureAction, verb: 'save' | 'delete') => {
    if (action.kind === 'sign_out') return apply({ kind: 'sign_out' });
    if (action.kind === 'gone') return apply({ kind: 'gone' });
    if (action.kind === 'read_only') apply({ kind: 'read_only' });
    showProblem({ kind: 'message', text: failureText(action, verb) });
  };

  const startWork = (kind: 'saving' | 'deleting') => {
    showProblem(null);
    apply({ kind: 'notice', notice: null });
    apply({ kind: 'busy', busy: { kind, retrying: null } });
  };

  const resetLoads = async (toSend: SessionEdit, signal: AbortSignal) => {
    const exercises = await ports.latestExercises();
    if (signal.aborted) return;
    const loadTypes = new Map(exercises.filter(isLiftExercise).map((exercise) => [exercise.id, exercise.loadType]));
    apply({ kind: 'edit', edit: withoutBodyweightLoads(toSend, loadTypes) });
    showProblem({ kind: 'message', text: BODYWEIGHT_LOAD_RESET_TEXT });
  };

  const save = async (toSend: SessionEdit, setIdRetriesLeft = SET_ID_RETRIES): Promise<void> => {
    const signal = ports.signal();
    startWork('saving');
    let retried = false;
    const outcome = await ports.editSession(editPayload(toSend), signal, (reason) => {
      retried = true;
      apply({ kind: 'busy', busy: { kind: 'saving', retrying: reason } });
    });
    if (signal.aborted) return;
    apply({ kind: 'busy', busy: IDLE });
    if (outcome.kind === 'ok') {
      const { revision, replayedSessionIds, revokedDrops } = outcome.data;
      ports.forgetSummaries(summariesToForget(sessionId, replayedSessionIds, retried, ports.rememberedSummaryId()));
      apply({ kind: 'saved', saved: savedEdit(toSend, revision) });
      apply({ kind: 'notice', notice: withRemoved('Changes saved.', ports.describeRevoked(revokedDrops)) });
      return reloadSession(signal, SAVED_RELOAD_FAILED_TEXT, (fresh) => {
        apply({ kind: 'adopt', fresh });
        showProblem(null);
      });
    }
    const action = failureAction(outcome);
    if (action.kind === 'reid_sets' && setIdRetriesLeft > 0) {
      const reIded = withNewSetIds(toSend, action.setIds);
      apply({ kind: 'edit', edit: reIded });
      return save(reIded, setIdRetriesLeft - 1);
    }
    if (action.kind === 'revision_conflict')
      return reloadSession(signal, CONFLICT_RELOAD_FAILED_TEXT, (fresh) => showProblem({ kind: 'conflict', fresh }));
    if (action.kind === 'ask_bodyweight') return showProblem({ kind: 'bodyweight', pending: toSend });
    if (action.kind === 'unknown_exercise')
      return showProblem({ kind: 'unknown_exercise', exerciseIds: action.exerciseIds });
    if (action.kind === 'fix_bodyweight_load') return resetLoads(toSend, signal);
    handleCommonFailure(action, 'save');
  };

  const remove = async (ifRevision: number): Promise<void> => {
    const signal = ports.signal();
    startWork('deleting');
    const outcome = await ports.deleteSession({ sessionId, ifRevision }, signal, (reason) =>
      apply({ kind: 'busy', busy: { kind: 'deleting', retrying: reason } }),
    );
    if (signal.aborted) return;
    apply({ kind: 'busy', busy: IDLE });
    apply({ kind: 'delete_settled' });
    if (outcome.kind === 'ok') {
      ports.forgetSummaries([sessionId, ...outcome.data.replayedSessionIds]);
      ports.forgetDeletedSession();
      apply({
        kind: 'deleted',
        notice: withRemoved('Workout deleted.', ports.describeRevoked(outcome.data.revokedDrops)),
      });
      return;
    }
    const action = failureAction(outcome);
    if (action.kind === 'revision_conflict') {
      return reloadSession(signal, CONFLICT_RELOAD_FAILED_TEXT, (fresh) => {
        apply({ kind: 'adopt', fresh });
        showProblem({ kind: 'message', text: failureText(action, 'delete') });
      });
    }
    handleCommonFailure(action, 'delete');
  };

  return { save: (toSend) => save(toSend), remove };
}
