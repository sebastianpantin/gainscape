import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './local-stack.ts';

const supabaseConfig = readFileSync(join(import.meta.dirname, '../../supabase/config.toml'), 'utf8');

function configValue(section: string, key: string): string {
  const body = supabaseConfig.split(/^\[/m).find((chunk) => chunk.startsWith(`${section}]`));
  const value = body === undefined ? undefined : new RegExp(`^${key} = "([^"]*)"`, 'm').exec(body)?.[1];
  if (value === undefined) throw new Error(`supabase/config.toml has no ${key} under [${section}]`);
  return value;
}

function secondsOf(duration: string): number {
  const seconds = /^(\d+)s$/.exec(duration)?.[1];
  if (seconds === undefined) throw new Error(`Unsupported duration ${duration} in supabase/config.toml`);
  return Number(seconds);
}

const MAX_FREQUENCY_MARGIN_MS = 500;

export const CONFIRM_SUBJECT = configValue('auth.email.template.confirmation', 'subject');
export const RECOVERY_SUBJECT = configValue('auth.email.template.recovery', 'subject');
export const EMAIL_CHANGE_SUBJECT = configValue('auth.email.template.email_change', 'subject');
export const MAX_FREQUENCY_WAIT_MS =
  secondsOf(configValue('auth.email', 'max_frequency')) * 1000 + MAX_FREQUENCY_MARGIN_MS;

export interface MailMessage {
  ID: string;
  Subject: string;
  Created: string;
  To: { Address: string }[];
  HTML: string;
  Text: string;
}

interface SearchResult {
  messages: { ID: string; Subject: string; Created: string }[];
}

const POLL_INTERVAL_MS = 250;

function searchUrl(to: string): string {
  return `${env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`;
}

async function mailpit<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mailpit GET ${url} answered ${response.status}`);
  return (await response.json()) as T;
}

export async function listEmailsTo(to: string, since: Date, subject?: string) {
  const { messages } = await mailpit<SearchResult>(searchUrl(to));
  return messages
    .filter((message) => new Date(message.Created).getTime() >= since.getTime())
    .filter((message) => subject === undefined || message.Subject === subject)
    .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());
}

export async function waitForEmail(
  to: string,
  { subject, since, timeoutMs = 15_000 }: { subject?: string; since: Date; timeoutMs?: number },
): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [newest] = await listEmailsTo(to, since, subject);
    if (newest) return await mailpit<MailMessage>(`${env.MAILPIT_URL}/api/v1/message/${newest.ID}`);
    if (Date.now() > deadline) throw new Error(`No email to ${to}${subject ? ` titled "${subject}"` : ''} arrived`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function authLinkFrom(message: Pick<MailMessage, 'HTML'>): string {
  const href = /href="([^"]*token_hash=[^"]*)"/.exec(message.HTML)?.[1];
  if (!href) throw new Error('The email has no token_hash link');
  return href.replaceAll('&amp;', '&');
}
