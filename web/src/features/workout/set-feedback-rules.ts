import { formatXp } from '../../lib/format.ts';
import { type PreviewRecord, recordChipLabel } from './record-preview.ts';
import { previewXpLabel, type SetPreview } from './xp-preview.ts';

export const SET_DONE_VIBRATION_MS: readonly number[] = Object.freeze([12]);
export const NEW_RECORD_VIBRATION_MS: readonly number[] = Object.freeze([60, 40, 60]);
export const XP_DROP_MS = 900;

export interface SetFeedbackInput {
  label: string;
  wasDone: boolean;
  isDone: boolean;
  preview: SetPreview;
  record: PreviewRecord | null;
  becameRecord: boolean;
  vibrate: boolean;
}

export interface SetDrop {
  xpText: string | null;
  record: boolean;
  announcement: string;
}

export interface ShownSetDrop extends SetDrop {
  setId: string;
  key: number;
}

export interface SetFeedback {
  drop: SetDrop | null;
  vibrationMs: readonly number[] | null;
}

function earnedText(preview: SetPreview): string | null {
  if (preview.basis === 'unknown') return null;
  if (preview.basis === 'warmup') return 'warm-up';
  if (preview.xp <= 0) return 'no XP';
  return `about ${formatXp(preview.xp)} XP`;
}

function setDrop(label: string, preview: SetPreview, record: PreviewRecord | null): SetDrop {
  const earned = earnedText(preview);
  const logged = earned === null ? `${label} logged` : `${label} logged, ${earned}`;
  return {
    xpText: preview.basis === 'unknown' || preview.xp <= 0 ? null : `+${previewXpLabel(preview)} XP`,
    record: record !== null,
    announcement: record === null ? logged : `${logged}. ${recordChipLabel(record)}`,
  };
}

export function setFeedback(input: SetFeedbackInput): SetFeedback {
  const logged = !input.wasDone && input.isDone;
  const drop = logged ? setDrop(input.label, input.preview, input.record) : null;
  if (!input.vibrate) return { drop, vibrationMs: null };
  if (input.becameRecord) return { drop, vibrationMs: NEW_RECORD_VIBRATION_MS };
  return { drop, vibrationMs: logged ? SET_DONE_VIBRATION_MS : null };
}
