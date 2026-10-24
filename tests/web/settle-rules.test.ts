import { describe, expect, it } from 'vitest';
import { allInOrder } from '../../web/src/lib/query/settle-rules.ts';

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

describe('allInOrder', () => {
  it('resolves every value in order', async () => {
    await expect(allInOrder([Promise.resolve(1), Promise.resolve('two')])).resolves.toEqual([1, 'two']);
  });

  it('fails with the first failure in list order, not the one that failed first in time', async () => {
    await expect(allInOrder([rejectAfter(20, 'skills'), rejectAfter(0, 'profile')])).rejects.toThrow('skills');
  });

  it('fails with a later failure when the earlier ones succeed', async () => {
    await expect(allInOrder([Promise.resolve(1), rejectAfter(0, 'profile')])).rejects.toThrow('profile');
  });
});
