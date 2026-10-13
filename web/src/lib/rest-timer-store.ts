import { keyedStore } from './keyed-store.ts';
import { parseRestState } from './rest-timer-rules.ts';

export const {
  key: restStateKey,
  read: readRestState,
  save: saveRestState,
  forget: forgetRestState,
} = keyedStore('gainscape.rest.', parseRestState);
