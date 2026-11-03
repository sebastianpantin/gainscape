import { type ToastAction } from './toast.ts';

const BASE_MS = 5000;
const MS_PER_CHARACTER = 50;
const LONGEST_MS = 9000;
const CHARACTERS_READ_IN_BASE = 40;
const WITH_ACTION_MS = 12000;
export const MAX_SHOWN_TOASTS = 3;

export interface ShownToast {
  id: number;
  text: string;
  action: ToastAction | null;
  raisedFromKeyboard: boolean;
}

export function toastDurationMs(text: string, hasAction = false, raisedFromKeyboard = false): number | null {
  if (hasAction) return raisedFromKeyboard ? null : WITH_ACTION_MS;
  const extraCharacters = Math.max(0, text.length - CHARACTERS_READ_IN_BASE);
  return Math.min(LONGEST_MS, BASE_MS + extraCharacters * MS_PER_CHARACTER);
}

export function addToast(shown: readonly ShownToast[], next: ShownToast): ShownToast[] {
  return [...shown.filter((toast) => toast.action !== null), next].slice(-MAX_SHOWN_TOASTS);
}

export function toastsAfterLeaving(shown: ShownToast[]): ShownToast[] {
  return shown.some((toast) => toast.action !== null) ? shown.filter((toast) => toast.action === null) : shown;
}
