import { FunctionsHttpError } from '@supabase/supabase-js';
import { authCallbackUrl, authErrorMessage, emailChangeProblem } from './auth-links.ts';
import { httpErrorBody } from './function-client-rules.ts';
import { RATE_LIMITED_STATUS, retryAfterSeconds, tryAgainIn } from './rate-limit.ts';
import { supabase } from './supabase.ts';

async function functionProblem(error: unknown, reasons: Record<string, string>, fallback: string): Promise<string> {
  if (!(error instanceof FunctionsHttpError)) return fallback;
  const response = error.context as Response;
  const body = await httpErrorBody(response);
  if (response.status === RATE_LIMITED_STATUS) return tryAgainIn(retryAfterSeconds(body.details));
  return (body.error ? reasons[body.error] : undefined) ?? fallback;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const current = await supabase.auth.getUser();
  if (current.error) throw new Error(authErrorMessage(current.error));
  const check = await supabase.auth.signInWithPassword({
    email: current.data.user.email ?? '',
    password: currentPassword,
  });
  if (check.error) {
    throw new Error(
      check.error.code === 'invalid_credentials' ? 'Your current password is wrong.' : authErrorMessage(check.error),
    );
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function requestEmailChange(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: authCallbackUrl(window.location.origin) },
  );
  if (error) throw new Error(emailChangeProblem(error));
}

export async function exportMyData(): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('export-data', { body: {} });
  if (error) throw new Error(await functionProblem(error, {}, 'Could not export your data.'));
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export function exportFileName(): string {
  return `gainscape-export-${new Date().toISOString().slice(0, 10)}.json`;
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
  throw new Error(await functionProblem(error, DELETE_REASONS, 'Could not delete your account.'));
}
