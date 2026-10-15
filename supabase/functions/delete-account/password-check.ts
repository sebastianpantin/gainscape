import { HttpError, logUnexpectedError } from '../_shared/http.ts';

interface SignInError {
  status?: number;
  code?: string;
}

const TOO_MANY_REQUESTS = 429;

export function passwordMatchesAfterSignIn(error: SignInError | null, signedIn: boolean): boolean {
  if (error === null) return signedIn;
  if (error.code === 'invalid_credentials') return false;
  if (error.status === TOO_MANY_REQUESTS) throw new HttpError(429, 'auth_rate_limited');
  throw authServiceFailure(error);
}

export function authServiceFailure(error: unknown): HttpError {
  logUnexpectedError(error);
  return new HttpError(503, 'auth_unavailable');
}
