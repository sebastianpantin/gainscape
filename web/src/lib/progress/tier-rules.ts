export function highestReached<Tier extends string>(
  tiers: readonly Tier[],
  minimum: Readonly<Record<Tier, number>>,
  value: number,
): Tier | null {
  return tiers.reduce<Tier | null>((reached, tier) => (value >= minimum[tier] ? tier : reached), null);
}
