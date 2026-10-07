export type LoadedState<T> =
  { status: 'loading' } | { status: 'failed'; problem: string } | { status: 'ready'; data: T };

export function loadedState<T>(data: T | undefined, error: Error | null): LoadedState<T> {
  if (data !== undefined) return { status: 'ready', data };
  if (error) return { status: 'failed', problem: error.message };
  return { status: 'loading' };
}
