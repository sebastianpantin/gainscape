import { describe, expect, it } from 'vitest';
import { parseStatusOutput, stackEnvMismatch } from '../../scripts/local-stack.ts';

const RUN_THROUGH_MAKE = 'run through make, or `set -a; . ./.stack.env; set +a` first';

describe('stackEnvMismatch', () => {
  it('accepts a checkout without .stack.env', () => {
    expect(stackEnvMismatch(null, { SUPABASE_PROJECT_ID: 'anything' })).toBeNull();
  });

  it('accepts a .stack.env that sets no project id', () => {
    expect(stackEnvMismatch('GAINSCAPE_WEB_PORT=5180\n', {})).toBeNull();
    expect(stackEnvMismatch('SUPABASE_PROJECT_ID=\n', {})).toBeNull();
  });

  it('accepts an environment that matches the trimmed project id on any line', () => {
    const text = 'GAINSCAPE_WEB_PORT=5180\nSUPABASE_PROJECT_ID= gainscape_wt2 \nSUPABASE_API_PORT=55321\n';
    expect(stackEnvMismatch(text, { SUPABASE_PROJECT_ID: 'gainscape_wt2' })).toBeNull();
  });

  it('names both project ids when the environment points at another stack', () => {
    expect(stackEnvMismatch('SUPABASE_PROJECT_ID=gainscape_wt2\n', { SUPABASE_PROJECT_ID: 'gainscape' })).toBe(
      `.stack.env sets SUPABASE_PROJECT_ID=gainscape_wt2 but the environment has gainscape; ${RUN_THROUGH_MAKE}`,
    );
  });

  it('reports none when the environment has no project id', () => {
    expect(stackEnvMismatch('SUPABASE_PROJECT_ID=gainscape_wt2\n', {})).toBe(
      `.stack.env sets SUPABASE_PROJECT_ID=gainscape_wt2 but the environment has none; ${RUN_THROUGH_MAKE}`,
    );
  });

  it('ignores a commented or indented project id line', () => {
    expect(stackEnvMismatch('# SUPABASE_PROJECT_ID=gainscape_wt2\n', {})).toBeNull();
    expect(stackEnvMismatch(' SUPABASE_PROJECT_ID=gainscape_wt2\n', {})).toBeNull();
  });
});

describe('parseStatusOutput', () => {
  it('reads the JSON after any banner the CLI prints first', () => {
    const output = 'Stopped services: [supabase_studio]\n{"DB_URL":"postgresql://127.0.0.1:54322/postgres"}\n';
    expect(parseStatusOutput(output)).toEqual({ DB_URL: 'postgresql://127.0.0.1:54322/postgres' });
  });

  it('reads plain JSON', () => {
    expect(parseStatusOutput('{"ANON_KEY":"anon"}')).toEqual({ ANON_KEY: 'anon' });
  });

  it('throws on output without JSON', () => {
    expect(() => parseStatusOutput('supabase is not running')).toThrow();
  });
});
