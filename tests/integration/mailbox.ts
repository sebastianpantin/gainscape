import { env } from './local-stack.ts';

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
