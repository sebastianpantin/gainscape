interface RawFunctionAnswer {
  status: number;
  rawBody: string;
}

export function isEdgeRuntimeDrop(status: number, rawBody: string): boolean {
  if (status < 500) return false;
  try {
    const body = JSON.parse(rawBody);
    return typeof body !== 'object' || body === null || !('error' in body);
  } catch {
    return true;
  }
}

export async function retryEdgeRuntimeDrops<T extends RawFunctionAnswer>(
  send: () => Promise<T>,
  retries: number,
  onDrop: (dropped: T) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const answer = await send();
    if (attempt === retries || !isEdgeRuntimeDrop(answer.status, answer.rawBody)) return answer;
    onDrop(answer);
  }
}

export async function forEachConcurrently<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer, got ${limit}`);
  let next = 0;
  const failures: unknown[] = [];
  const worker = async () => {
    while (failures.length === 0 && next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await task(item);
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failures.length > 0) throw failures[0];
}

export interface UserPage {
  userIds: string[];
  next: string | null;
}

export interface RebuildTotals {
  rebuilt: number;
  missing: number;
}

export interface RebuildListedUsersOptions {
  listPage: (after: string | null) => Promise<UserPage>;
  rebuildBatch: (userIds: readonly string[]) => Promise<RebuildTotals>;
  batchSize: number;
  parallelBatches: number;
  recheckFromStart: boolean;
  onProgress: (sofar: RebuildTotals) => void;
}

function inBatches<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

export async function rebuildListedUsers(options: RebuildListedUsersOptions): Promise<RebuildTotals> {
  const totals: RebuildTotals = { rebuilt: 0, missing: 0 };
  let after: string | null = null;
  do {
    const page: UserPage = await options.listPage(after);
    await forEachConcurrently(inBatches(page.userIds, options.batchSize), options.parallelBatches, async (batch) => {
      const done = await options.rebuildBatch(batch);
      totals.rebuilt += done.rebuilt;
      totals.missing += done.missing;
    });
    if (page.userIds.length > 0) options.onProgress({ ...totals });
    after = page.next;
  } while (after !== null);
  if (options.recheckFromStart) {
    const [leftover] = (await options.listPage(null)).userIds;
    if (leftover !== undefined) {
      throw new Error(`users still need a rebuild after the run, starting with ${leftover}; run it again`);
    }
  }
  return totals;
}

export type RebuildScope = 'stale' | 'all';

export interface RebuildEndpoint {
  url: string;
  headers: Record<string, string>;
}

const EDGE_RUNTIME_RETRIES = 2;
const USERS_PER_PAGE = 1000;

export function rebuildScopeFrom(argv: readonly string[]): RebuildScope {
  return argv.includes('--all') ? 'all' : 'stale';
}

async function postJson<T>(endpoint: RebuildEndpoint, body: unknown): Promise<T> {
  const { status, rawBody } = await retryEdgeRuntimeDrops(
    async () => {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { ...endpoint.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, rawBody: await response.text() };
    },
    EDGE_RUNTIME_RETRIES,
    (dropped) => console.warn(`retrying: the edge runtime dropped the request (${dropped.status})`),
  );
  if (status !== 200) throw new Error(`rebuild-caches answered ${status}: ${rawBody}`);
  return JSON.parse(rawBody) as T;
}

export async function rebuildThrough(
  endpoint: RebuildEndpoint,
  scope: RebuildScope,
  limits: { batchSize: number; parallelBatches: number },
): Promise<RebuildTotals> {
  return await rebuildListedUsers({
    listPage: (after) => postJson<UserPage>(endpoint, { list: { scope, after, limit: USERS_PER_PAGE } }),
    rebuildBatch: async (userIds) => {
      const answer = await postJson<{ rebuilt: unknown[]; missing: unknown[] }>(endpoint, { userIds });
      return { rebuilt: answer.rebuilt.length, missing: answer.missing.length };
    },
    ...limits,
    recheckFromStart: scope === 'stale',
    onProgress: ({ rebuilt }) => console.log(`rebuilt ${rebuilt} users so far`),
  });
}
