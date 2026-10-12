import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const loadInPlainNode = (modulePath: string) =>
  execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(modulePath)})`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

describe('changelog loading outside Vite', () => {
  it('loads the changelog reader in plain Node, as make changelog-unreleased and make deploy do', () => {
    expect(() => loadInPlainNode(new URL('../../web/build/changelog.ts', import.meta.url).href)).not.toThrow();
  });
});
