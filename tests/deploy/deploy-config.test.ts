import { describe, expect, it } from 'vitest';
import {
  authSettingsProblems,
  backupConfigProblems,
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

function fakeApiKey(kind: 'publishable' | 'secret', filler: string): string {
  return ['sb', kind, filler.repeat(32)].join('_');
}

const config = {
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  SUPABASE_DB_PASSWORD: 'db-password-value',
  SUPABASE_SECRET_KEY: fakeApiKey('secret', 's'),
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: fakeApiKey('publishable', 'p'),
  CLOUDFLARE_PAGES_PROJECT: 'gainscape',
};
const GPG_FINGERPRINT = '0123456789ABCDEF0123456789ABCDEF01234567';

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
      Object.entries(config).filter(([key]) => key !== 'SUPABASE_SECRET_KEY' && key !== 'SUPABASE_DB_PASSWORD'),
    );
    expect(deployConfigProblems(partial)).toEqual(['missing SUPABASE_DB_PASSWORD', 'missing SUPABASE_SECRET_KEY']);
  });

  it('does not need a backup key to deploy', () => {
    expect(deployConfigProblems({ ...config, GPG_RECIPIENT: GPG_FINGERPRINT })).toEqual([]);
    expect(deployConfigProblems({ ...config, GPG_RECIPIENT: 'admin@example.test' })).toEqual([]);
  });

  it('requires the API URL of the configured project', () => {
    expect(deployConfigProblems({ ...config, VITE_SUPABASE_URL: 'https://otherprojectref1234.supabase.co' })).toEqual([
      'VITE_SUPABASE_URL must be https://abcdefghijklmnopqrst.supabase.co',
    ]);
  });

  it('refuses a secret key where the publishable key belongs, since it would ship in the bundle', () => {
    for (const secret of [config.SUPABASE_SECRET_KEY, fakeJwt('service_role')]) {
      expect(deployConfigProblems({ ...config, VITE_SUPABASE_PUBLISHABLE_KEY: secret })).toEqual([
        'VITE_SUPABASE_PUBLISHABLE_KEY holds a secret key; use the publishable key',
      ]);
    }
  });

  it('refuses the legacy anon JWT where the publishable key belongs', () => {
    expect(deployConfigProblems({ ...config, VITE_SUPABASE_PUBLISHABLE_KEY: fakeJwt('anon') })).toEqual([
      'VITE_SUPABASE_PUBLISHABLE_KEY holds a legacy JWT key; use the sb_publishable_ key from Settings → API Keys',
    ]);
  });

  it.each([
    ['any other value', 'not-a-key'],
    ['a bare prefix', 'sb_publishable_'],
    ['a truncated paste', 'sb_publishable_abc'],
    ['a trailing space', `${fakeApiKey('publishable', 'p')} `],
  ])('refuses %s where the publishable key belongs', (_case, value) => {
    expect(deployConfigProblems({ ...config, VITE_SUPABASE_PUBLISHABLE_KEY: value })).toEqual([
      'VITE_SUPABASE_PUBLISHABLE_KEY must be a whole sb_publishable_ key; check for a cut-off paste or stray spaces',
    ]);
  });

  it('refuses the legacy service_role JWT where the secret key belongs', () => {
    expect(deployConfigProblems({ ...config, SUPABASE_SECRET_KEY: fakeJwt('service_role') })).toEqual([
      'SUPABASE_SECRET_KEY holds a legacy JWT key; use an sb_secret_ key from Settings → API Keys',
    ]);
  });

  it.each([
    ['the publishable key', fakeApiKey('publishable', 'p')],
    ['any other value', 'not-a-key'],
    ['a bare prefix', 'sb_secret_'],
    ['a truncated paste', 'sb_secret_abc'],
    ['a trailing space', `${fakeApiKey('secret', 's')} `],
  ])('refuses %s where the secret key belongs', (_case, value) => {
    expect(deployConfigProblems({ ...config, SUPABASE_SECRET_KEY: value })).toEqual([
      'SUPABASE_SECRET_KEY must be a whole sb_secret_ key; check for a cut-off paste or stray spaces',
    ]);
  });

  it('lists the values the bundle must never contain', () => {
    expect(configuredSecrets(config)).toEqual([config.SUPABASE_SECRET_KEY, config.SUPABASE_DB_PASSWORD]);
  });
});

describe('backup settings', () => {
  it('accepts the full fingerprint of the backup key', () => {
    expect(backupConfigProblems({ ...config, GPG_RECIPIENT: GPG_FINGERPRINT })).toEqual([]);
  });

  it('needs a backup key to back up', () => {
    expect(backupConfigProblems(config)).toEqual(['missing GPG_RECIPIENT; backups are encrypted to it']);
  });

  it('requires the full fingerprint of the backup key, since an email can match the wrong key', () => {
    expect(backupConfigProblems({ ...config, GPG_RECIPIENT: 'admin@example.test' })).toEqual([
      'GPG_RECIPIENT must be a 40-character key fingerprint',
    ]);
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
