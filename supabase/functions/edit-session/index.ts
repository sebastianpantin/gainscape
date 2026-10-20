import { sql } from '../_shared/db.ts';
import {
  DEFAULT_BALANCE,
  isNoOpEdit,
  type RevokedDrop,
  type SessionSummary,
  type StoredSet,
  unchangedSetIds,
  writableSetFor,
} from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { assertDistinctPrescriptionRefs, type SetPayload } from '../_shared/session-payload.ts';
import { loadKnownCatalog } from '../_shared/stores/catalog.ts';
import { deriveEditedSession } from '../_shared/stores/replay.ts';
import {
  assertEditableAt,
  assertSetIdsUnused,
  bumpRevision,
  loadPrescriptionRefs,
  loadProfileSettings,
  loadStoredSetsById,
  lockUser,
  requireOwnedSession,
  writeEditedSets,
} from '../_shared/stores/sessions.ts';
import { prescriptionSnapshotsBySetId } from '../_shared/stores/set-columns.ts';
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
    const { storedSets, storedById } = await loadStoredSetsById(tx, payload.sessionId);
    if (isNoOpEdit(payload, session.notes, storedById, DEFAULT_BALANCE)) {
      return { summary: session.summary, revision: session.revision, replayedSessionIds: [], revokedDrops: [] };
    }
    await takeRateLimit(tx, 'session_edit_hour', userId);

    assertEditableAt(session, payload.ifRevision, Date.now());
    assertKindsUnchanged(payload.sets, storedById);
    const addedSets = payload.sets.filter((set) => !storedById.has(set.id));
    assertDistinctPrescriptionRefs(addedSets);
    const catalog = await loadKnownCatalog(tx, userId, payload.sets);
    const newSetIds = addedSets.map((set) => set.id);
    if (newSetIds.length > 0) await assertSetIdsUnused(tx, newSetIds);
    const storedRefs = await loadPrescriptionRefs(tx, payload.sessionId);
    const keptRefs = new Set(payload.sets.flatMap((set) => storedRefs.get(set.id) ?? []));
    const addedSnapshots = prescriptionSnapshotsBySetId(
      addedSets,
      (prescription) => session.programLinked && !keptRefs.has(prescription.ref),
    );

    const unchanged = unchangedSetIds(payload.sets, storedById, DEFAULT_BALANCE);
    const { bodyweightKg } = await loadProfileSettings(tx, userId);
    const requested = payload.sets.map((set) => {
      const stored = storedById.get(set.id);
      return writableSetFor(
        set,
        catalog.exercises.get(set.exerciseId)!,
        bodyweightKg,
        stored?.kind === 'lift' || stored?.kind === 'hold' ? stored : undefined,
      );
    });

    await writeEditedSets(tx, userId, payload.sessionId, storedSets, requested, addedSnapshots, DEFAULT_BALANCE);
    const revision = await bumpRevision(tx, payload.sessionId, payload.notes);

    const { summary, replayedSessionIds, revokedDrops } = await deriveEditedSession(
      tx,
      userId,
      session.key,
      storedSets,
      unchanged,
    );
    return { summary, revision, replayedSessionIds, revokedDrops };
  });
}

serveAuthenticated(parseEditSessionPayload, editSession);
