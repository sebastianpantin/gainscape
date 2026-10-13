import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

export const AGENTS_DOC_BYTE_LIMIT = 16_384;

export interface AgentsDocSize {
  path: string;
  bytes: number;
}

export function oversizedAgentsDocs(
  docs: readonly AgentsDocSize[],
  limit: number = AGENTS_DOC_BYTE_LIMIT,
): AgentsDocSize[] {
  return docs.filter((doc) => doc.bytes > limit).sort((left, right) => right.bytes - left.bytes);
}

export function sizeReport(doc: AgentsDocSize, limit: number = AGENTS_DOC_BYTE_LIMIT): string {
  return `${doc.path} is ${doc.bytes} bytes, over the ${limit} byte limit`;
}

function trackedAgentsDocs(): AgentsDocSize[] {
  return execFileSync('git', ['ls-files', '*AGENTS.md'], { encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '')
    .map((path) => ({ path, bytes: statSync(path).size }));
}

if (import.meta.main) {
  const oversized = oversizedAgentsDocs(trackedAgentsDocs());
  for (const doc of oversized) console.error(sizeReport(doc));
  if (oversized.length > 0) {
    console.error('Document rules and reasons, not what the code says. Trim the files above.');
    process.exit(1);
  }
}
