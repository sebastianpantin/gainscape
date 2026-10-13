import { keyedStore } from './keyed-store.ts';
import { parseSessionBaseline } from './session-baseline-rules.ts';

export const {
  read: readSessionBaseline,
  save: saveSessionBaseline,
  forget: forgetSessionBaseline,
} = keyedStore('gainscape.session-baseline.', parseSessionBaseline);
