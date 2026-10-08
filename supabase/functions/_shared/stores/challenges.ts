import type { Transaction } from '../db.ts';
import { type ChallengeDefinition, challengeDefinitionFromStored } from '../domain/index.ts';

export interface ClaimedChallenge {
  challengeId: string;
  key: string;
  name: string;
  definition: ChallengeDefinition;
}

export async function claimChallengeScroll(
  tx: Transaction,
  userId: string,
  challengeId: string,
  sessionId: string,
): Promise<ClaimedChallenge | null> {
  const [claimable] = await tx`
    select c.id, c.key, c.name, c.definition, i.id as item_id
    from public.challenges c
    join public.items i on i.grants_challenge_id = c.id and i.kind = 'scroll'
    join public.user_items u on u.user_id = ${userId} and u.item_id = i.id
    where c.id = ${challengeId} and c.retired_at is null and u.quantity >= 1
    for update of u`;
  if (!claimable) return null;
  await tx`
    update public.user_items set quantity = quantity - 1, updated_at = now()
    where user_id = ${userId} and item_id = ${claimable.item_id}`;
  await tx`
    insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
    values (${userId}, ${claimable.item_id}, -1, 'challenge', ${sessionId})`;
  return {
    challengeId: claimable.id,
    key: claimable.key,
    name: claimable.name,
    definition: challengeDefinitionFromStored(claimable.definition),
  };
}
