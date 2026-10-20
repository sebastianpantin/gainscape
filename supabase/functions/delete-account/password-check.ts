import { HttpError } from '../_shared/http.ts';
import { authServiceFailure, RATE_LIMITED_STATUS } from '../_shared/token-check.ts';

interface SignInError {
  status?: number;
  code?: string;
}

export function passwordMatchesAfterSignIn(error: SignInError | null, signedIn: boolean): boolean {
  if (error === null) return signedIn;
  if (error.code === 'invalid_credentials') return false;
  if (error.status === RATE_LIMITED_STATUS) throw new HttpError(429, 'auth_rate_limited');
  throw authServiceFailure(error);
}
