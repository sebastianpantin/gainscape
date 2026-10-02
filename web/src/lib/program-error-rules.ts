export const PROGRAM_OFFLINE_TEXT = "You're offline. Starting or editing a program needs a connection.";

export function programErrorText(error: unknown): string {
  void error;
  throw new Error('not implemented');
}
