import { randomInt } from 'node:crypto';

const USERNAME = /^[a-z0-9_]{3,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOOK_ALIKE_CHARACTERS = new Set(['I', 'O', 'l', '0', '1']);
const UNAMBIGUOUS_CHARACTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'abcdefghijklmnopqrstuvwxyz', ...'0123456789']
  .filter((character) => !LOOK_ALIKE_CHARACTERS.has(character))
  .join('');
const PASSWORD_GROUPS = 4;
const PASSWORD_GROUP_LENGTH = 5;

export interface Tester {
  email: string;
  username: string;
}

export function testerArguments(env: Readonly<Record<string, string | undefined>>): Tester {
  return { email: (env.EMAIL ?? '').trim().toLowerCase(), username: (env.USERNAME ?? '').trim().toLowerCase() };
}

export function inviteProblems({ email, username }: Tester): string[] {
  return [
    ...(EMAIL.test(email) ? [] : ['EMAIL must be an email address']),
    ...(USERNAME.test(username) ? [] : ['USERNAME must be 3–20 characters: lowercase letters, digits, underscore']),
  ];
}

export function oneTimePassword(): string {
  return Array.from({ length: PASSWORD_GROUPS }, () =>
    Array.from(
      { length: PASSWORD_GROUP_LENGTH },
      () => UNAMBIGUOUS_CHARACTERS[randomInt(UNAMBIGUOUS_CHARACTERS.length)],
    ).join(''),
  ).join('-');
}
