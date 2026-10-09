import type { Release } from '../../lib/changelog-rules.ts';

export const CHANGELOG: readonly Release[] = __CHANGELOG__;
export const APP_VERSION = CHANGELOG[0].version;
