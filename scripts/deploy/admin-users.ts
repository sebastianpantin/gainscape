import type { DeployConfig } from './rules.ts';

const USERS_PER_PAGE = 1000;

export interface AuthUser {
  id: string;
  email?: string;
}

export function adminHeaders(config: DeployConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: config.SUPABASE_SERVICE_ROLE_KEY!,
    'Content-Type': 'application/json',
  };
}

export async function findUserByEmail(config: DeployConfig, email: string): Promise<AuthUser> {
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `${config.VITE_SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${USERS_PER_PAGE}`,
      { headers: adminHeaders(config) },
    );
    if (!response.ok) throw new Error(`listing users failed: ${response.status}`);
    const { users } = (await response.json()) as { users: AuthUser[] };
    const found = users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (users.length < USERS_PER_PAGE) throw new Error(`no account for ${email}`);
  }
}
