import { authenticatedUserId } from '../_shared/auth.ts';
import { sql } from '../_shared/db.ts';
import {
  DEFAULT_BALANCE,
  isNoOpEdit,
  isSessionEditable,
  type RevokedDrop,
  type SessionSummary,
  type StoredSet,
  writableSetFor,
} from '../_shared/domain/index.ts';
import { asHttpError } from '../_shared/http-errors.ts';
import { HttpError, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serve } from '../_shared/serve.ts';
import type { SetPayload } from '../_shared/session-payload.ts';
import { loadKnownCatalog } from '../_shared/stores/catalog.ts';
import { replayFrom } from '../_shared/stores/replay.ts';
import {
  assertSetIdsUnused,
  bumpRevision,
  loadProfileSettings,
  loadStoredSets,
  lockUser,
  requireOwnedSession,
  storedSummary,
  writeEditedSets,
} from '../_shared/stores/sessions.ts';
import { type EditSessionPayload, parseEditSessionPayload } from './payload.ts';

interface EditResponse {
  summary: SessionSummary;
  revision: number;
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

function assertKindsUnchanged(sets: readonly SetPayload[], storedById: ReadonlyMap<string, StoredSet>): void {
  const changed = sets.filter((set) => {
    const stored = storedById.get(set.id);
    return stored !== undefined && stored.kind !== set.kind;
  });
  if (changed.length > 0) throw new HttpError(422, 'kind_changed', { setIds: changed.map((set) => set.id) });
}

async function editSession(userId: string, payload: EditSessionPayload): Promise<EditResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);

    const session = await requireOwnedSession(tx, userId, payload.sessionId);
    const storedSets = await loadStoredSets(tx, payload.sessionId);
    const storedById = new Map(storedSets.map((set) => [set.id, set]));
    if (isNoOpEdit(payload, session.notes, storedById, DEFAULT_BALANCE)) {
      return { summary: session.summary, revision: session.revision, replayedSessionIds: [], revokedDrops: [] };
    }

    if (!isSessionEditable({ historyOnly: session.historyOnly, startedAt: session.key.startedAt }, Date.now()))
      throw new HttpError(409, 'edit_window_closed');
    if (payload.ifRevision !== session.revision) {
      throw new HttpError(409, 'revision_conflict', { revision: session.revision });
    }
    assertKindsUnchanged(payload.sets, storedById);
    const catalog = await loadKnownCatalog(tx, userId, payload.sets);
    const newSetIds = payload.sets.filter((set) => !storedById.has(set.id)).map((set) => set.id);
    if (newSetIds.length > 0) await assertSetIdsUnused(tx, newSetIds);

    const { bodyweightKg } = await loadProfileSettings(tx, userId);
    const requested = payload.sets.map((set) => {
      const stored = storedById.get(set.id);
      return writableSetFor(
        set,
        catalog.exercises.get(set.exerciseId)!,
        bodyweightKg,
        stored?.kind === 'lift' ? stored : undefined,
      );
    });

    await takeRateLimit(tx, 'session_edit_hour', userId);
    await writeEditedSets(tx, userId, payload.sessionId, storedSets, requested, DEFAULT_BALANCE);
    const revision = await bumpRevision(tx, payload.sessionId, payload.notes);

    const storedExerciseIds = [...new Set(storedSets.map((set) => set.exerciseId))];
    const { replayedSessionIds, revokedDrops } = await replayFrom(
      tx,
      userId,
      session.key,
      storedExerciseIds,
      DEFAULT_BALANCE,
    );
    return {
      summary: await storedSummary(tx, payload.sessionId),
      revision,
      replayedSessionIds,
      revokedDrops,
    };
  });
}

serve(async (request) => {
  const userId = await authenticatedUserId(request);
  const payload = parseEditSessionPayload(await readJsonBody(request));
  return jsonResponse(await editSession(userId, payload));
}, asHttpError);
