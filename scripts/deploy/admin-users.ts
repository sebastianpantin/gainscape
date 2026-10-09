import type { DeployConfig } from './rules.ts';

const USERS_PER_PAGE = 1000;

export interface AuthUser {
  id: string;
  email?: string;
}

export function adminHeaders(config: DeployConfig): Record<string, string> {
  return {
    apikey: config.SUPABASE_SECRET_KEY!,
    'Content-Type': 'application/json',
  };
}

async function* userPages(config: DeployConfig): AsyncGenerator<AuthUser[]> {
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `${config.VITE_SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${USERS_PER_PAGE}`,
      { headers: adminHeaders(config) },
    );
    if (!response.ok) throw new Error(`listing users failed: ${response.status}`);
    const { users } = (await response.json()) as { users: AuthUser[] };
    yield users;
    if (users.length < USERS_PER_PAGE) return;
  }
}

export async function findUserByEmail(config: DeployConfig, email: string): Promise<AuthUser> {
  for await (const users of userPages(config)) {
    const found = users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
  }
  throw new Error(`no account for ${email}`);
}
