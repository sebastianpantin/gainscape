import { useState } from 'react';

export function useSessionState<Value>(sessionId: string | null, initial: Value): [Value, (next: Value) => void] {
  const [held, setHeld] = useState({ sessionId, value: initial });
  const value = held.sessionId === sessionId ? held.value : initial;
  return [value, (next: Value) => setHeld({ sessionId, value: next })];
}
