import { isDeviceOffline } from '../../offline/cache-first.ts';
import { type InvokeOutcome, invokeAsOwnerWith, type OwnerClient } from './function-client-rules.ts';
import { supabase } from './supabase.ts';

const supabaseOwnerClient: OwnerClient = {
  getSession: () => supabase.auth.getSession(),
  refreshSession: () => supabase.auth.refreshSession(),
  invoke: (name, options) => supabase.functions.invoke(name, options),
  isOffline: isDeviceOffline,
};

export function invokeAsOwner<T>(
  userId: string,
  name: string,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<InvokeOutcome<T>> {
  return invokeAsOwnerWith<T>(supabaseOwnerClient, userId, name, body, timeoutMs, signal);
}
