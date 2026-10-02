import { FunctionsHttpError } from '@supabase/supabase-js';
import { authCallbackUrl } from './auth-links.ts';
import { httpErrorBody } from './function-client-rules.ts';
import { RATE_LIMITED_STATUS, retryAfterSeconds, tryAgainIn } from './rate-limit.ts';
import { supabase } from './supabase.ts';

export { MINIMUM_PASSWORD_LENGTH } from './auth-links.ts';

async function functionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    const body = await httpErrorBody(response);
    if (response.status === RATE_LIMITED_STATUS) return tryAgainIn(retryAfterSeconds(body.details));
    return body.error ?? `http_${response.status}`;
  }
  return error instanceof Error ? error.message : 'network_error';
}

export async function changePassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
  const check = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (check.error) throw new Error('Your current password is wrong.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function requestEmailChange(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: authCallbackUrl(window.location.origin) },
  );
  if (error) throw new Error(error.message);
}

export async function exportMyData(): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('export-data', { body: {} });
  if (error) throw new Error(await functionError(error));
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export function exportFileName(now = new Date()): string {
  return `gainscape-export-${now.toISOString().slice(0, 10)}.json`;
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DELETE_REASONS: Record<string, string> = {
  confirmation_mismatch: "That isn't your username.",
  wrong_password: 'Your password is wrong.',
};

export async function deleteMyAccount(confirmUsername: string, password: string): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirmUsername, password } });
  if (!error) return;
  const reason = await functionError(error);
  throw new Error(DELETE_REASONS[reason] ?? reason);
}
