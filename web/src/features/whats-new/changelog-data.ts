import type { Release } from '../../lib/platform/changelog-rules.ts';

export const CHANGELOG: readonly Release[] = __CHANGELOG__;
export const APP_VERSION = CHANGELOG[0].version;
