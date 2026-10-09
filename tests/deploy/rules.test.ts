import { describe, expect, it } from 'vitest';
import {
  allowlistedBuildEnvironment,
  bundleLeaks,
  changelogProblem,
  childEnvironment,
  deployFileProblem,
  gitleaksAsset,
  inRepoDeployFiles,
  nativeSupabasePackages,
  strayViteEnvFiles,
  unknownPrsProblem,
} from '../../scripts/deploy/rules.ts';

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fakeJwt(payload: object): string {
  return [base64Url({ alg: 'HS256', typ: 'JWT' }), base64Url(payload), 'c2lnbmF0dXJl'].join('.');
}

const fakeSecretKey = ['sb', 'secret', 'x'.repeat(32)].join('_');

describe('deploy file', () => {
  const repoRoot = '/home/admin/gainscape';
  const safe = {
    path: '/home/admin/.config/gainscape/deploy.env',
    realPath: '/home/admin/.config/gainscape/deploy.env',
    isSymlink: false,
    mode: 0o100600,
    ownerUid: 1000,
    currentUid: 1000,
  };

  it('accepts a file only its owner can read, outside the repo', () => {
    expect(deployFileProblem(safe, repoRoot)).toBeNull();
  });

  it.each([0o100640, 0o100644, 0o100604, 0o100660])('refuses a file readable by others (mode %o)', (mode) => {
    expect(deployFileProblem({ ...safe, mode }, repoRoot)).toMatch(/chmod 600/);
  });

  it('refuses a deploy file inside the repo', () => {
    const inRepo = { ...safe, path: '/home/admin/gainscape/deploy.env', realPath: '/home/admin/gainscape/deploy.env' };
    expect(deployFileProblem(inRepo, repoRoot)).toMatch(/outside the repo/);
  });

  it('refuses a symlink, which could point back into the repo', () => {
    expect(
      deployFileProblem({ ...safe, isSymlink: true, realPath: '/home/admin/gainscape/secrets.txt' }, repoRoot),
    ).toMatch(/symlink/);
  });

  it('refuses a file that another user owns', () => {
    expect(deployFileProblem({ ...safe, ownerUid: 0 }, repoRoot)).toMatch(/owned by/);
  });

  it('does not mistake a sibling folder with the same prefix for the repo', () => {
    const sibling = {
      ...safe,
      path: '/home/admin/gainscape-secrets/deploy.env',
      realPath: '/home/admin/gainscape-secrets/deploy.env',
    };
    expect(deployFileProblem(sibling, repoRoot)).toBeNull();
  });

  it('finds deploy files anywhere in the repo listing', () => {
    expect(inRepoDeployFiles(['web/src/main.tsx', 'deploy.env', 'supabase/.deploy.env', 'docs/deploy.md'])).toEqual([
      'deploy.env',
      'supabase/.deploy.env',
    ]);
  });
});

describe('build environment', () => {
  const allowed = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];

  it('passes only the allowlisted public variables and the path', () => {
    const env = {
      PATH: '/usr/bin',
      VITE_SUPABASE_URL: 'https://ref.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable',
      SUPABASE_SECRET_KEY: fakeSecretKey,
      HOME: '/home/admin',
    };
    expect(allowlistedBuildEnvironment(env, allowed)).toEqual({
      PATH: '/usr/bin',
      VITE_SUPABASE_URL: 'https://ref.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable',
    });
  });

  it('refuses any other VITE_ variable, which Vite would put in the bundle', () => {
    expect(() =>
      allowlistedBuildEnvironment(
        { VITE_SUPABASE_URL: 'u', VITE_SUPABASE_PUBLISHABLE_KEY: 'a', VITE_SERVICE_KEY: fakeSecretKey },
        allowed,
      ),
    ).toThrow(/VITE_SERVICE_KEY/);
  });

  it('refuses a missing allowlisted variable', () => {
    expect(() => allowlistedBuildEnvironment({ VITE_SUPABASE_URL: 'u' }, allowed)).toThrow(
      /VITE_SUPABASE_PUBLISHABLE_KEY/,
    );
  });
});

describe('Vite env files', () => {
  it('refuses every env file a production build would load', () => {
    expect(
      strayViteEnvFiles([
        '.env',
        '.env.local',
        '.env.production',
        '.env.production.local',
        '.env.development',
        'index.html',
      ]),
    ).toEqual(['.env', '.env.local', '.env.production', '.env.production.local']);
  });

  it('allows the development env files a production build ignores', () => {
    expect(strayViteEnvFiles(['.env.development', '.env.development.local', 'src'])).toEqual([]);
  });
});

describe('child process environment', () => {
  it('passes only what a CLI needs to find its own login, including the desktop keyring, plus the named extras', () => {
    const env = {
      PATH: '/usr/bin',
      HOME: '/home/admin',
      XDG_CONFIG_HOME: '/home/admin/.config',
      XDG_RUNTIME_DIR: '/run/user/1000',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      SUPABASE_DB_PASSWORD: 'from-the-shell',
      AWS_SECRET_ACCESS_KEY: 'unrelated',
      VITE_SUPABASE_URL: 'u',
    };
    expect(childEnvironment(env)).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/admin',
      XDG_CONFIG_HOME: '/home/admin/.config',
      XDG_RUNTIME_DIR: '/run/user/1000',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
    });
    expect(childEnvironment(env, { SUPABASE_DB_PASSWORD: 'from-deploy-env' })).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/admin',
      XDG_CONFIG_HOME: '/home/admin/.config',
      XDG_RUNTIME_DIR: '/run/user/1000',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      SUPABASE_DB_PASSWORD: 'from-deploy-env',
    });
  });
});

describe('native Supabase CLI package', () => {
  it('lists the platform binary packages in the order the npm wrapper tries them', () => {
    expect(nativeSupabasePackages('linux', 'x64')).toEqual(['@supabase/cli-linux-x64', '@supabase/cli-linux-x64-musl']);
    expect(nativeSupabasePackages('darwin', 'arm64')).toEqual(['@supabase/cli-darwin-arm64']);
    expect(nativeSupabasePackages('win32', 'x64')).toEqual(['@supabase/cli-windows-x64']);
  });
});

describe('bundle scan', () => {
  const serviceRoleJwt = fakeJwt({ iss: 'supabase', ref: 'abc', role: 'service_role' });
  const publishableKey = ['sb', 'publishable', 'p'.repeat(32)].join('_');

  it('passes a bundle with only the publishable key', () => {
    expect(bundleLeaks([{ path: 'assets/index.js', content: `const key="${publishableKey}";` }], [])).toEqual([]);
  });

  it('finds a known secret value', () => {
    const files = [{ path: 'assets/index.js', content: 'const password="hunter2-db-password";' }];
    expect(bundleLeaks(files, ['hunter2-db-password'])).toEqual(['assets/index.js: a configured secret value']);
  });

  it('finds a Supabase secret key by its prefix', () => {
    expect(bundleLeaks([{ path: 'a.js', content: `x="${fakeSecretKey}"` }], [])).toEqual(['a.js: an sb_secret_ key']);
  });

  it('finds a service-role JWT', () => {
    expect(bundleLeaks([{ path: 'a.js', content: `x="${serviceRoleJwt}"` }], [])).toEqual(['a.js: a service_role JWT']);
  });

  it('finds a Postgres connection string with a password', () => {
    const uri = ['postgresql://postgres.ref', 'Vq8zL2pMx9wRt4Kq@aws-0-eu.pooler.supabase.com:6543/postgres'].join(':');
    expect(bundleLeaks([{ path: 'a.js', content: `x="${uri}"` }], [])).toEqual([
      'a.js: a Postgres URL with a password',
    ]);
  });

  it('ignores empty configured secrets so an unset value cannot match everything', () => {
    expect(bundleLeaks([{ path: 'a.js', content: 'anything' }], [''])).toEqual([]);
  });
});

describe('gitleaks release', () => {
  it('pins the release asset and checksum for each supported platform', () => {
    expect(gitleaksAsset('linux', 'x64')).toEqual({
      name: 'gitleaks_8.30.1_linux_x64.tar.gz',
      sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    });
    expect(gitleaksAsset('darwin', 'arm64').name).toBe('gitleaks_8.30.1_darwin_arm64.tar.gz');
  });

  it('refuses an unsupported platform', () => {
    expect(() => gitleaksAsset('win32', 'x64')).toThrow(/win32/);
  });
});

describe('changelog gate', () => {
  it('passes when every user-facing pull request is covered', () => {
    expect(changelogProblem([])).toBeNull();
  });

  it('names one uncovered pull request', () => {
    expect(changelogProblem([{ number: 70, title: "Show a What's new sheet" }])).toBe(
      "1 merged PR is not in the changelog yet:\n#70 Show a What's new sheet\nAsk Claude to write the changelog, merge that PR, then deploy again.",
    );
  });

  it('counts and lists several uncovered pull requests in order', () => {
    expect(
      changelogProblem([
        { number: 72, title: 'Rest timer sound' },
        { number: 71, title: 'Plate maths' },
        { number: 70, title: "Show a What's new sheet" },
      ]),
    ).toBe(
      [
        '3 merged PRs are not in the changelog yet:',
        '#72 Rest timer sound',
        '#71 Plate maths',
        "#70 Show a What's new sheet",
        'Ask Claude to write the changelog, merge that PR, then deploy again.',
      ].join('\n'),
    );
  });

  it('passes when every covered number is a merged pull request', () => {
    expect(unknownPrsProblem([])).toBeNull();
  });

  it('refuses covered numbers with no merged pull request', () => {
    expect(unknownPrsProblem([70, 71])).toBe(
      'web/changelog.yaml lists PRs that are not merged since the changelog began: #70, #71\nRemove them from prs (or wait for them to merge), merge that fix, then deploy again.',
    );
  });
});
