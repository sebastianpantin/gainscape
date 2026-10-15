import { useState } from 'react';

export function useSessionState<Value>(sessionId: string | null, initial: Value): [Value, (next: Value) => void] {
  const [held, setHeld] = useState({ sessionId, value: initial });
  const current = held.sessionId === sessionId ? held : { sessionId, value: initial };
  if (current !== held) setHeld(current);
  return [current.value, (next: Value) => setHeld({ sessionId, value: next })];
}
