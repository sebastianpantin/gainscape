import { type InfiniteData, QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  keepFirstPage,
  QUERY_ROOTS_CHANGED_BY,
  QUERY_ROOTS_REFETCHED_FROM_THE_FIRST_PAGE,
} from '../../web/src/lib/query/query-freshness-rules.ts';

vi.mock('../../web/src/lib/platform/supabase.ts', () => ({ supabase: {} }));

const { announceDataChange } = await import('../../web/src/lib/query/data-changes.ts');
const { lastLoggedWeightsQuery } = await import('../../web/src/lib/query/queries.ts');

const PAGE_SIZE = 2;
const HISTORY_KEY = ['history', 'user-1'];

function pagedHistory() {
  const fetchedPages: number[] = [];
  const options = {
    queryKey: HISTORY_KEY,
    queryFn: ({ pageParam }: { pageParam: number }) => {
      fetchedPages.push(pageParam);
      return Promise.resolve(Array.from({ length: PAGE_SIZE }, (_, index) => pageParam * PAGE_SIZE + index));
    },
    initialPageParam: 0,
    getNextPageParam: (_lastPage: number[], pages: number[][]) => pages.length,
  };
  return { options, fetchedPages };
}

describe('keepFirstPage', () => {
  it('drops every loaded page after the first so a refetch asks the server for one page', () => {
    expect(keepFirstPage({ pages: [[1], [2], [3]], pageParams: [null, 1, 2] })).toEqual({
      pages: [[1]],
      pageParams: [null],
    });
  });

  it('leaves a single page, a plain query and an empty cache as they are', () => {
    const onePage = { pages: [[1]], pageParams: [null] };
    const plain = { loaded: [1, 2], fromCache: false };
    expect(keepFirstPage(onePage)).toBe(onePage);
    expect(keepFirstPage(plain)).toBe(plain);
    expect(keepFirstPage(undefined)).toBeUndefined();
  });
});

describe('QUERY_ROOTS_REFETCHED_FROM_THE_FIRST_PAGE', () => {
  it('covers the paged history and feed lists a finished workout changes', () => {
    expect([...QUERY_ROOTS_REFETCHED_FROM_THE_FIRST_PAGE].sort()).toEqual(['feed', 'history']);
    for (const root of QUERY_ROOTS_REFETCHED_FROM_THE_FIRST_PAGE)
      expect(QUERY_ROOTS_CHANGED_BY['workout-changed']).toContain(root);
  });
});

describe('announceDataChange', () => {
  it('refetches only the first page of a paged list a workout changed', async () => {
    const client = new QueryClient();
    const { options, fetchedPages } = pagedHistory();
    await client.fetchInfiniteQuery({ ...options, pages: 3 });
    fetchedPages.length = 0;

    await announceDataChange(client, 'workout-changed');
    await client.fetchInfiniteQuery(options);

    expect(fetchedPages).toEqual([0]);
    expect(client.getQueryData<InfiniteData<number[]>>(HISTORY_KEY)?.pages).toEqual([[0, 1]]);
  });
});

describe('lastLoggedWeightsQuery', () => {
  it('keys the same exercises the same way whatever order they come in', () => {
    expect(lastLoggedWeightsQuery(['squat', 'bench', 'deadlift']).queryKey).toEqual(
      lastLoggedWeightsQuery(['deadlift', 'squat', 'bench']).queryKey,
    );
  });
});
