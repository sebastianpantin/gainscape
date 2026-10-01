import { describe, expect, it } from 'vitest';
import { type InstallFacts, installState, isIosSafari } from '../../web/src/pwa/install-state.ts';

const combinations: InstallFacts[] = Array.from({ length: 16 }, (_, bits) => ({
  standalone: (bits & 1) !== 0,
  installedThisSession: (bits & 2) !== 0,
  hasDeferredPrompt: (bits & 4) !== 0,
  iosSafari: (bits & 8) !== 0,
}));

function expected(facts: InstallFacts) {
  if (facts.standalone || facts.installedThisSession) return 'installed';
  if (facts.hasDeferredPrompt) return 'promptable';
  if (facts.iosSafari) return 'ios_manual';
  return 'unavailable';
}

describe('installState', () => {
  it.each(combinations)('%o', (facts) => {
    expect(installState(facts)).toBe(expected(facts));
  });

  it('covers every combination', () => {
    expect(new Set(combinations.map((facts) => JSON.stringify(facts))).size).toBe(16);
  });
});

describe('isIosSafari', () => {
  it.each([
    [
      'iPhone Safari',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      5,
      true,
    ],
    [
      'iPadOS desktop-mode Safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      5,
      true,
    ],
    [
      'macOS Safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      0,
      false,
    ],
    [
      'CriOS',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
      5,
      false,
    ],
    [
      'FxiOS',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
      5,
      false,
    ],
    [
      'EdgiOS',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/130.0 Mobile/15E148 Safari/605.1.15',
      5,
      false,
    ],
    [
      'Android Chrome',
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      5,
      false,
    ],
  ] as const)('%s', (_name, userAgent, maxTouchPoints, iosSafari) => {
    expect(isIosSafari(userAgent, maxTouchPoints)).toBe(iosSafari);
  });
});
