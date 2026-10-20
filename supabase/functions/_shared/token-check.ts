import { HttpError, logUnexpectedError } from './http.ts';

export const RATE_LIMITED_STATUS = 429;

export function tokenCheckFailure(error: { status?: number }): HttpError {
  const status = error.status ?? 0;
  if (status >= 400 && status < 500 && status !== RATE_LIMITED_STATUS) return new HttpError(401, 'invalid_token');
  return authServiceFailure(error);
}

export function authServiceFailure(error: unknown): HttpError {
  logUnexpectedError(error);
  return new HttpError(503, 'auth_unavailable');
}
