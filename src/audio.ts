export interface SoundSettings { volume: number; muted: boolean }
export const soundSettings: SoundSettings = { volume: .35, muted: false };
let context: AudioContext | undefined;

export function unlockAudio() {
  try { context ??= new AudioContext(); void context.resume(); } catch { /* Audio can be disabled by the browser. */ }
}
export function playSound(kind: string) {
  if (!context || soundSettings.muted || soundSettings.volume === 0) return;
  const tones: Record<string, [number, number, number]> = {
    shot: [620, 180, .07], hit: [170, 70, .1], kill: [250, 55, .2],
    respawn: [260, 740, .18], pickup: [600, 1000, .13], victory: [440, 880, .45]
  };
  const [from, to, duration] = tones[kind] ?? tones.shot;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = kind === 'hit' ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(from, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(to, context.currentTime + duration);
  gain.gain.setValueAtTime(soundSettings.volume * .14, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
  oscillator.connect(gain); gain.connect(context.destination);
  oscillator.start(); oscillator.stop(context.currentTime + duration);
}
