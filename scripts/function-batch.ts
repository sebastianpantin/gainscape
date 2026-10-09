export interface RawFunctionAnswer {
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
