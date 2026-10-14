import { type ReactNode, useId } from 'react';
import { type LoadedState } from '../../lib/query/query-state-rules.ts';

interface StatusSectionProps<T> {
  title: string;
  state: LoadedState<T>;
  children: (data: T) => ReactNode;
}

export function StatusSection<T>({ title, state, children }: StatusSectionProps<T>) {
  const headingId = useId();
  if (state.status === 'loading') return null;
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {state.status === 'failed' ? <p className="muted">{state.problem}</p> : children(state.data)}
    </section>
  );
}
