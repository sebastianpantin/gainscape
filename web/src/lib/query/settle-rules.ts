export async function allInOrder<T extends readonly unknown[]>(
  pending: readonly [...{ [K in keyof T]: Promise<T[K]> }],
): Promise<T> {
  for (const result of await Promise.allSettled(pending)) if (result.status === 'rejected') throw result.reason;
  return (await Promise.all(pending)) as unknown as T;
}
