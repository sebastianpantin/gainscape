import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminHeaders, type AuthUser, findUserByEmail } from '../../scripts/deploy/admin-users.ts';

const config = {
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};
const FULL_PAGE = 1000;

function strangers(count: number, page: number): AuthUser[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${page}-${index}`,
    email: `p${page}u${index}@example.com`,
  }));
}

function stubUserPages(pages: AuthUser[][]) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    return new Response(JSON.stringify({ users: pages[page - 1] ?? [] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adminHeaders', () => {
  it('authorizes with the service role key as bearer token and apikey', () => {
    expect(adminHeaders(config)).toEqual({
      Authorization: 'Bearer service-key',
      apikey: 'service-key',
      'Content-Type': 'application/json',
    });
  });
});

describe('findUserByEmail', () => {
  it('pages through full pages until it finds the email, ignoring stored case', async () => {
    const fetchMock = stubUserPages([
      strangers(FULL_PAGE, 1),
      [...strangers(3, 2), { id: 'target', email: 'Tester@Example.com' }],
    ]);
    await expect(findUserByEmail(config, 'tester@example.com')).resolves.toEqual({
      id: 'target',
      email: 'Tester@Example.com',
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://abcdefghijklmnopqrst.supabase.co/auth/v1/admin/users?page=1&per_page=1000',
      'https://abcdefghijklmnopqrst.supabase.co/auth/v1/admin/users?page=2&per_page=1000',
    ]);
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: adminHeaders(config) });
  });

  it('stops at the first page shorter than a full page and reports no account', async () => {
    const fetchMock = stubUserPages([strangers(FULL_PAGE, 1), strangers(FULL_PAGE - 1, 2), strangers(5, 3)]);
    await expect(findUserByEmail(config, 'missing@example.com')).rejects.toThrow('no account for missing@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports no account after an empty first page', async () => {
    const fetchMock = stubUserPages([[]]);
    await expect(findUserByEmail(config, 'missing@example.com')).rejects.toThrow('no account for missing@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails with the status when listing users fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    await expect(findUserByEmail(config, 'tester@example.com')).rejects.toThrow('listing users failed: 503');
  });
});
