export const MIN_LOOT_SECRET_LENGTH = 32;

export type LootSecretDecision = 'create' | 'accept' | 'reject';

export function lootSecretDecision(existingEnvText: string | null): LootSecretDecision {
  if (existingEnvText === null) return 'create';
  const secret = /^LOOT_SECRET=(.*)$/m.exec(existingEnvText)?.[1]?.trim();
  return secret && secret.length >= MIN_LOOT_SECRET_LENGTH ? 'accept' : 'reject';
}
