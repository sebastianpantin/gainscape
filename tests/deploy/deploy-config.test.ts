import { describe, expect, it } from 'vitest';
import {
  authSettingsProblems,
  configuredSecrets,
  deployConfigProblems,
  linkedRefProblem,
  parseDeployEnv,
  releaseProblem,
} from '../../scripts/deploy/rules.ts';

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fakeJwt(role: string): string {
  return [base64Url({ alg: 'HS256' }), base64Url({ ref: 'abcdefghijklmnopqrst', role }), 'c2ln'].join('.');
}

const config = {
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  SUPABASE_DB_PASSWORD: 'db-password-value',
  SUPABASE_SERVICE_ROLE_KEY: fakeJwt('service_role'),
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_SUPABASE_ANON_KEY: fakeJwt('anon'),
  CLOUDFLARE_PAGES_PROJECT: 'gainscape',
  GPG_RECIPIENT: '0123456789ABCDEF0123456789ABCDEF01234567',
};

describe('deploy.env parsing', () => {
  it('reads KEY=VALUE lines, skipping blanks and comments and stripping quotes', () => {
    const text = ['# deploy settings', '', 'A=1', 'B="two words"', "C='3'", 'D=x=y'].join('\n');
    expect(parseDeployEnv(text)).toEqual({ A: '1', B: 'two words', C: '3', D: 'x=y' });
  });
});

describe('deploy.env checks', () => {
  it('accepts a complete, consistent config', () => {
    expect(deployConfigProblems(config)).toEqual([]);
  });

  it('names every missing setting', () => {
    const partial = Object.fromEntries(
      Object.entries(config).filter(([key]) => key !== 'GPG_RECIPIENT' && key !== 'SUPABASE_DB_PASSWORD'),
    );
    expect(deployConfigProblems(partial)).toEqual(['missing GPG_RECIPIENT', 'missing SUPABASE_DB_PASSWORD']);
  });

  it('requires the API URL of the configured project', () => {
    expect(deployConfigProblems({ ...config, VITE_SUPABASE_URL: 'https://otherprojectref1234.supabase.co' })).toEqual([
      'VITE_SUPABASE_URL must be https://abcdefghijklmnopqrst.supabase.co',
    ]);
  });

  it('refuses a secret key where the public anon key belongs, since it would ship in the bundle', () => {
    expect(deployConfigProblems({ ...config, VITE_SUPABASE_ANON_KEY: config.SUPABASE_SERVICE_ROLE_KEY })).toEqual([
      'VITE_SUPABASE_ANON_KEY holds a secret key; use the anon (publishable) key',
    ]);
    const secretKey = ['sb', 'secret', 'y'.repeat(32)].join('_');
    expect(deployConfigProblems({ ...config, VITE_SUPABASE_ANON_KEY: secretKey })).toEqual([
      'VITE_SUPABASE_ANON_KEY holds a secret key; use the anon (publishable) key',
    ]);
  });

  it('requires the legacy service_role JWT, which the hosted rebuild and gateway accept', () => {
    const secretKey = ['sb', 'secret', 'z'.repeat(32)].join('_');
    expect(deployConfigProblems({ ...config, SUPABASE_SERVICE_ROLE_KEY: secretKey })).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY must be the legacy service_role JWT (Settings → API → Legacy API keys)',
    ]);
  });

  it('requires the full fingerprint of the backup key, since an email can match the wrong key', () => {
    expect(deployConfigProblems({ ...config, GPG_RECIPIENT: 'admin@example.test' })).toEqual([
      'GPG_RECIPIENT must be a 40-character key fingerprint',
    ]);
  });

  it('lists the values the bundle must never contain', () => {
    expect(configuredSecrets(config)).toEqual([config.SUPABASE_SERVICE_ROLE_KEY, config.SUPABASE_DB_PASSWORD]);
  });
});

describe('release checks', () => {
  it('needs the CLI linked to the configured project', () => {
    expect(linkedRefProblem('abcdefghijklmnopqrst', 'abcdefghijklmnopqrst')).toBeNull();
    expect(linkedRefProblem('abcdefghijklmnopqrst', null)).toMatch(/supabase link/);
    expect(linkedRefProblem('abcdefghijklmnopqrst', 'zzzzzzzzzzzzzzzzzzzz')).toMatch(/zzzz/);
  });

  it('deploys only a clean tree at origin/main', () => {
    expect(releaseProblem({ dirtyPaths: [], head: 'abc', originMain: 'abc' })).toBeNull();
    expect(releaseProblem({ dirtyPaths: ['web/src/App.tsx'], head: 'abc', originMain: 'abc' })).toMatch(/App.tsx/);
    expect(releaseProblem({ dirtyPaths: [], head: 'abc', originMain: 'def' })).toMatch(/origin\/main/);
  });
});

describe('hosted auth settings', () => {
  const closed = {
    disable_signup: true,
    mailer_autoconfirm: true,
    external: { email: true, anonymous_users: false, github: false, phone: false },
  };

  it('accepts invite-only email sign-in', () => {
    expect(authSettingsProblems(closed)).toEqual([]);
  });

  it('refuses open sign-up, which would let strangers in without email confirmation', () => {
    expect(authSettingsProblems({ ...closed, disable_signup: false })).toEqual([
      'Auth: turn "Allow new users to sign up" off',
    ]);
  });

  it('refuses every other sign-in provider, anonymous sign-ins included', () => {
    expect(
      authSettingsProblems({ ...closed, external: { ...closed.external, anonymous_users: true, github: true } }),
    ).toEqual(['Auth: turn the anonymous_users provider off', 'Auth: turn the github provider off']);
  });

  it('refuses an answer it cannot read', () => {
    expect(authSettingsProblems(null)).toEqual(['Auth: could not read the settings']);
  });
});
