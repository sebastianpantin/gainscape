import { keyedStore } from './keyed-store.ts';
import { parsePlateSettings } from './plate-rules.ts';

export const {
  read: readPlateSettings,
  save: savePlateSettings,
  forget: forgetPlateSettings,
} = keyedStore('gainscape.plates.', parsePlateSettings);
