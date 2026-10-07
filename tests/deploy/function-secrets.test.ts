import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { errorResponse, HttpError } from '../../supabase/functions/_shared/http.ts';

const functionsRoot = join(import.meta.dirname, '../../supabase/functions');

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('Edge Function responses', () => {
  it('never put an unexpected error message in the response body', async () => {
    const secret = ['postgres://admin', 'db-password@db.example.supabase.co'].join(':');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = errorResponse(new Error(`connection to ${secret} failed`));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe(JSON.stringify({ error: 'internal_error' }));
  });

  it('answer an expected error with its code only', async () => {
    const response = errorResponse(new HttpError(422, 'invalid_payload'));
    expect(JSON.parse(await response.text())).toEqual({ error: 'invalid_payload' });
  });
});

describe('Edge Function logging', () => {
  it('logs only from the reviewed places, so a new log line gets a secrets review', () => {
    const logging = sourceFiles(functionsRoot)
      .filter((path) => /\bconsole\.(log|info|warn|error|debug)\(/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(functionsRoot, path))
      .sort();
    expect(logging).toEqual(['_shared/http.ts', 'complete-session/index.ts']);
  });
});

describe('Edge Function API keys', () => {
  it('are read inside a request, so a missing key answers 500 api_key_missing instead of failing the boot', () => {
    const readAtLoad = sourceFiles(functionsRoot)
      .filter((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .some(
            (line) =>
              /^\S/.test(line) && !/^(export )?function /.test(line) && /\b(secretKey|publishableKey)\(\)/.test(line),
          ),
      )
      .map((path) => relative(functionsRoot, path));
    expect(readAtLoad).toEqual([]);
  });
});
