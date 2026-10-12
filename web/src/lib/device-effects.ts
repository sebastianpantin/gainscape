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

export function playTones(tones: readonly Tone[], volume: number, wave: OscillatorType = 'sine'): void {
  primeAudio();
  const context = audio;
  if (context === null || context.state !== 'running') return;
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

export function vibrate(pattern: readonly number[]): void {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    return;
  }
}
