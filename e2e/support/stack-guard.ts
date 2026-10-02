import { currentStackEnvMismatch } from '../../scripts/local-stack.ts';

export function assertStackEnvironment(): void {
  const mismatch = currentStackEnvMismatch();
  if (mismatch) throw new Error(`${mismatch}, so e2e never drives another stack`);
}
