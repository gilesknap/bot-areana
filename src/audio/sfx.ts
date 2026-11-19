/**
 * Procedural retro sound effects (jsfxr-style) with WebAudio: oscillators and noise shaped by
 * pitch slides, envelopes and filters. No audio assets, no music.
 */
import type { SimEvent } from '../shared/frames';

export type SfxName =
  | 'blaster'
  | 'enemy_blaster'
  | 'hit'
  | 'explosion'
  | 'big_explosion'
  | 'pickup'
  | 'bump'
  | 'scan'
  | 'shield_on'
  | 'shield_off'
  | 'low_energy'
  | 'victory'
  | 'defeat'
  | 'click';

type Wave = 'square' | 'sawtooth' | 'triangle' | 'sine' | 'noise';

/** One synthesised voice. Times in seconds, frequencies in Hz. */
export interface Voice {
  wave: Wave;
  /** Start and end pitch (exponential slide). Ignored for noise except as filter sweep. */
  freq: [number, number];
  attack: number;
  sustain: number;
  decay: number;
  volume: number;
  /** Low-pass cut-off sweep (start, end). */
  lowpass?: [number, number];
  /** Pitch wobble: [rate Hz, depth fraction]. */
  vibrato?: [number, number];
  /** Delay before this voice starts. */
  at?: number;
}

const note = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Sound recipes. Exported for tests and tuning. */
export const RECIPES: Readonly<Record<SfxName, Voice[]>> = {
  blaster: [
    { wave: 'square', freq: [1100, 180], attack: 0, sustain: 0.03, decay: 0.14, volume: 0.22, lowpass: [6000, 1200] },
    { wave: 'noise', freq: [0, 0], attack: 0, sustain: 0.01, decay: 0.06, volume: 0.12, lowpass: [7000, 2000] },
  ],
  enemy_blaster: [{ wave: 'sawtooth', freq: [620, 110], attack: 0, sustain: 0.03, decay: 0.16, volume: 0.14, lowpass: [3500, 800] }],
  hit: [
    { wave: 'noise', freq: [0, 0], attack: 0, sustain: 0.02, decay: 0.12, volume: 0.3, lowpass: [4000, 600] },
    { wave: 'square', freq: [220, 70], attack: 0, sustain: 0.02, decay: 0.08, volume: 0.12 },
  ],
  explosion: [
    { wave: 'noise', freq: [0, 0], attack: 0, sustain: 0.08, decay: 0.55, volume: 0.45, lowpass: [2400, 120] },
    { wave: 'sine', freq: [120, 35], attack: 0, sustain: 0.05, decay: 0.4, volume: 0.35 },
  ],
  big_explosion: [
    { wave: 'noise', freq: [0, 0], attack: 0, sustain: 0.15, decay: 1.0, volume: 0.55, lowpass: [2000, 80] },
    { wave: 'sine', freq: [90, 25], attack: 0, sustain: 0.1, decay: 0.8, volume: 0.45 },
  ],
  pickup: [
    { wave: 'square', freq: [note(76), note(76)], attack: 0, sustain: 0.05, decay: 0.03, volume: 0.15 },
    { wave: 'square', freq: [note(83), note(83)], attack: 0, sustain: 0.08, decay: 0.12, volume: 0.15, at: 0.06 },
  ],
  bump: [{ wave: 'triangle', freq: [180, 90], attack: 0, sustain: 0.02, decay: 0.08, volume: 0.25 }],
  scan: [{ wave: 'sine', freq: [600, 1500], attack: 0.01, sustain: 0.12, decay: 0.2, volume: 0.1, vibrato: [18, 0.03] }],
  shield_on: [{ wave: 'sawtooth', freq: [180, 520], attack: 0.02, sustain: 0.1, decay: 0.15, volume: 0.12, lowpass: [900, 3000] }],
  shield_off: [{ wave: 'sawtooth', freq: [520, 150], attack: 0.01, sustain: 0.05, decay: 0.15, volume: 0.1, lowpass: [3000, 600] }],
  low_energy: [
    { wave: 'square', freq: [440, 440], attack: 0, sustain: 0.06, decay: 0.02, volume: 0.1 },
    { wave: 'square', freq: [330, 330], attack: 0, sustain: 0.1, decay: 0.05, volume: 0.1, at: 0.1 },
  ],
  victory: [60, 64, 67, 72].map((n, i) => ({
    wave: 'square' as const,
    freq: [note(n), note(n)] as [number, number],
    attack: 0.005,
    sustain: i === 3 ? 0.3 : 0.08,
    decay: i === 3 ? 0.35 : 0.04,
    volume: 0.16,
    at: i * 0.11,
    vibrato: i === 3 ? ([6, 0.01] as [number, number]) : undefined,
  })),
  defeat: [67, 63, 60, 55].map((n, i) => ({
    wave: 'triangle' as const,
    freq: [note(n), note(n) * (i === 3 ? 0.9 : 1)] as [number, number],
    attack: 0.005,
    sustain: i === 3 ? 0.35 : 0.12,
    decay: i === 3 ? 0.4 : 0.05,
    volume: 0.22,
    at: i * 0.17,
  })),
  click: [{ wave: 'square', freq: [1400, 900], attack: 0, sustain: 0.005, decay: 0.03, volume: 0.07, lowpass: [5000, 3000] }],
};

/** Which sound (if any) a sim event makes. */
export function sfxForEvent(e: SimEvent): SfxName | null {
  switch (e.type) {
    case 'muzzle_flash':
      return e.botId === 'player' ? 'blaster' : 'enemy_blaster';
    case 'hit':
      return e.targetId === 'wall' ? null : 'hit';
    case 'explosion':
      return e.size === 'large' ? 'big_explosion' : 'explosion';
    case 'marker':
      return 'pickup';
    case 'bump':
      return e.botId === 'player' ? 'bump' : null;
    case 'scan':
      return e.botId === 'player' ? 'scan' : null;
    case 'shield':
      return e.on ? 'shield_on' : 'shield_off';
    case 'low_energy':
      return e.botId === 'player' ? 'low_energy' : null;
    default:
      return null;
  }
}

// ---- Playback ---------------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
const lastPlayed = new Map<SfxName, number>();
/** The same sound retriggered faster than this is dropped (4x playback can be busy). */
const MIN_GAP = 0.045;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);
  const len = ctx.sampleRate;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x3fffffff) - 1;
  }
  return ctx;
}

function playVoice(ac: AudioContext, v: Voice, t0: number): void {
  const start = t0 + (v.at ?? 0);
  const end = start + v.attack + v.sustain + v.decay;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(v.volume, start + Math.max(v.attack, 0.002));
  gain.gain.setValueAtTime(v.volume, start + v.attack + v.sustain);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  let out: AudioNode = gain;
  if (v.lowpass) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(v.lowpass[0], start);
    f.frequency.exponentialRampToValueAtTime(v.lowpass[1], end);
    gain.connect(f);
    out = f;
  }
  out.connect(master!);

  let src: AudioScheduledSourceNode;
  if (v.wave === 'noise') {
    const n = ac.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    src = n;
  } else {
    const o = ac.createOscillator();
    o.type = v.wave;
    o.frequency.setValueAtTime(v.freq[0], start);
    if (v.freq[1] !== v.freq[0]) o.frequency.exponentialRampToValueAtTime(Math.max(1, v.freq[1]), end);
    if (v.vibrato) {
      const lfo = ac.createOscillator();
      const depth = ac.createGain();
      lfo.frequency.value = v.vibrato[0];
      depth.gain.value = v.freq[0] * v.vibrato[1];
      lfo.connect(depth).connect(o.frequency);
      lfo.start(start);
      lfo.stop(end);
    }
    src = o;
  }
  src.connect(gain);
  src.start(start);
  src.stop(end + 0.02);
}

/** Play a sound effect (no-op while muted, or where WebAudio is unavailable). */
export function sfx(name: SfxName): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume();
  const now = ac.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < MIN_GAP) return;
  lastPlayed.set(name, now);
  for (const v of RECIPES[name]) playVoice(ac, v, now + 0.005);
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.6, ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}

/**
 * Browsers only allow audio after a user gesture: call once at start-up so the context is
 * created and resumed on the first click or key press.
 */
export function unlockAudioOnGesture(target: EventTarget = globalThis): void {
  const unlock = () => {
    const ac = audio();
    if (ac?.state === 'suspended') void ac.resume();
    target.removeEventListener('pointerdown', unlock);
    target.removeEventListener('keydown', unlock);
  };
  target.addEventListener('pointerdown', unlock);
  target.addEventListener('keydown', unlock);
}
