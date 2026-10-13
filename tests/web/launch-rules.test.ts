import { describe, expect, it } from 'vitest';
import { launchTargetPath } from '../../web/src/pwa/launch-rules.ts';

const origin = 'https://gainscape.pages.dev';

describe('launchTargetPath', () => {
  it('routes a shortcut launch to its path inside the open app', () => {
    expect(launchTargetPath({ targetURL: `${origin}/skills`, origin, currentPath: '/' })).toBe('/skills');
  });

  it('keeps the query string and hash of the target', () => {
    expect(launchTargetPath({ targetURL: `${origin}/programs/active?week=2#today`, origin, currentPath: '/' })).toBe(
      '/programs/active?week=2#today',
    );
  });

  it('stays put when the app already shows the target', () => {
    expect(launchTargetPath({ targetURL: `${origin}/skills`, origin, currentPath: '/skills' })).toBeNull();
  });

  it('ignores a launch without a target', () => {
    expect(launchTargetPath({ targetURL: undefined, origin, currentPath: '/' })).toBeNull();
  });

  it('ignores a target on another origin', () => {
    expect(launchTargetPath({ targetURL: 'https://example.com/skills', origin, currentPath: '/' })).toBeNull();
  });

  it('ignores a target that is not a URL', () => {
    expect(launchTargetPath({ targetURL: 'not a url', origin, currentPath: '/' })).toBeNull();
  });
});
