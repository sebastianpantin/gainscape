import { playTones, primeAudio, type Tone, vibrate } from './device-effects.ts';
import type { Fanfare } from '../collection/item-rules.ts';
import { deviceStorage } from './keyed-store.ts';
import { celebrationCues } from '../workout/training-device-rules.ts';
import { readTrainingDeviceSettings } from '../workout/training-device-store.ts';

interface Celebration {
  tones: readonly Tone[];
  volume: number;
  wave: OscillatorType;
  vibrationMs: readonly number[];
}

function arpeggio(frequenciesHz: readonly number[], stepS: number, lastLengthS: number): Tone[] {
  return frequenciesHz.map((frequencyHz, index) => ({
    frequencyHz,
    startS: index * stepS,
    lengthS: index === frequenciesHz.length - 1 ? lastLengthS : stepS,
  }));
}

export const LEVEL_UP_CELEBRATION: Celebration = {
  tones: arpeggio([523, 659, 784, 1047], 0.08, 0.3),
  volume: 0.18,
  wave: 'triangle',
  vibrationMs: [40, 50, 40, 50, 140],
};

export const FANFARE_CELEBRATIONS: Record<Fanfare, Celebration> = {
  rare: {
    tones: arpeggio([784, 988, 1319], 0.07, 0.25),
    volume: 0.14,
    wave: 'triangle',
    vibrationMs: [30, 40, 90],
  },
  legendary: {
    tones: arpeggio([523, 659, 784, 1047, 1319, 1568], 0.09, 0.6),
    volume: 0.18,
    wave: 'square',
    vibrationMs: [40, 40, 40, 40, 40, 40, 220],
  },
};

export const CRAFTED_CELEBRATION: Celebration = {
  tones: [
    { frequencyHz: 1568, startS: 0, lengthS: 0.05 },
    { frequencyHz: 1568, startS: 0.14, lengthS: 0.05 },
    { frequencyHz: 2093, startS: 0.3, lengthS: 0.2 },
  ],
  volume: 0.1,
  wave: 'square',
  vibrationMs: [25, 115, 25, 135, 60],
};

export function primeCelebrationAudio(userId: string): void {
  if (readTrainingDeviceSettings(deviceStorage(), userId).sound) primeAudio();
}

export function celebrate(userId: string, celebration: Celebration): void {
  for (const cue of celebrationCues(readTrainingDeviceSettings(deviceStorage(), userId))) {
    if (cue === 'vibrate') vibrate(celebration.vibrationMs);
    if (cue === 'sound') playTones(celebration.tones, celebration.volume, celebration.wave);
  }
}
