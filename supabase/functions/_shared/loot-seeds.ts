import { lootRollKey, lootSeedMessage, type Rng, type RollKind, sfc32FromSeed } from './domain/index.ts';
import { HttpError } from './http.ts';

const MIN_LOOT_SECRET_LENGTH = 32;

interface LootSeedRequest {
  setId: string;
  kind: RollKind;
}

export function lootSecret(): string {
  const secret = Deno.env.get('LOOT_SECRET');
  if (!secret || secret.length < MIN_LOOT_SECRET_LENGTH) throw new HttpError(500, 'loot_secret_missing');
  return secret;
}

export async function lootRngFor(
  secret: string,
  userId: string,
  requests: readonly LootSeedRequest[],
): Promise<(setId: string, kind: RollKind) => Rng> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const seeds = new Map<string, Uint8Array>();
  for (const request of requests) {
    const message = encoder.encode(lootSeedMessage(userId, request.setId, request.kind));
    seeds.set(lootRollKey(request.setId, request.kind), new Uint8Array(await crypto.subtle.sign('HMAC', key, message)));
  }
  return (setId, kind) => {
    const seed = seeds.get(lootRollKey(setId, kind));
    if (seed === undefined) throw new Error(`no loot seed for ${lootRollKey(setId, kind)}`);
    return sfc32FromSeed(seed);
  };
}
