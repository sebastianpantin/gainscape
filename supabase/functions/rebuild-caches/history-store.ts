import type { Transaction } from '../_shared/db.ts';
import { type BalanceConfig, effortInputFromStored, type SessionInput } from '../_shared/domain/index.ts';

export async function loadReplayableSessions(
  tx: Transaction,
  userId: string,
  cfg: BalanceConfig,
): Promise<SessionInput[]> {
  const rows = await tx`
    select s.id as session_id, s.started_at, st.id as set_id, st.exercise_id, st.position, st.weight_kg,
           st.effective_load_kg, st.reps, st.is_warmup, st.effort_input_type, st.effort_value
    from public.sessions s
    join public.sets st on st.session_id = s.id
    where s.user_id = ${userId} and not s.history_only
    order by s.started_at, s.id, st.position`;

  const sessions = new Map<string, SessionInput>();
  for (const row of rows) {
    const session: SessionInput = sessions.get(row.session_id) ?? {
      id: row.session_id,
      startedAt: new Date(row.started_at).toISOString(),
      sets: [],
    };
    session.sets.push({
      id: row.set_id,
      exerciseId: row.exercise_id,
      position: row.position,
      weightKg: Number(row.weight_kg),
      reps: row.reps,
      isWarmup: row.is_warmup,
      effort: effortInputFromStored(
        row.effort_input_type,
        row.effort_value === null ? null : Number(row.effort_value),
        cfg,
      ),
      recordedEffectiveLoadKg: Number(row.effective_load_kg),
    });
    sessions.set(row.session_id, session);
  }
  return [...sessions.values()];
}
