export interface Tone {
  frequencyHz: number;
  startS: number;
  lengthS: number;
}

let audio: AudioContext | null = null;

export function primeAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function scheduleTones(context: AudioContext, tones: readonly Tone[], volume: number, wave: OscillatorType): void {
  try {
    for (const tone of tones) {
      const toneStart = context.currentTime + tone.startS;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = tone.frequencyHz;
      gain.gain.value = volume;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneStart + tone.lengthS);
    }
  } catch {
    return;
  }
}

const RESUME_GRACE_MS = 500;

export function playTones(tones: readonly Tone[], volume: number, wave: OscillatorType = 'sine'): void {
  primeAudio();
  const context = audio;
  if (context === null) return;
  if (context.state === 'running') {
    scheduleTones(context, tones, volume, wave);
    return;
  }
  if (context.state !== 'suspended') return;
  const askedAt = performance.now();
  context.resume().then(
    () => {
      if (performance.now() - askedAt <= RESUME_GRACE_MS) scheduleTones(context, tones, volume, wave);
    },
    () => undefined,
  );
}

export function vibrate(pattern: readonly number[]): void {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    return;
  }
}
