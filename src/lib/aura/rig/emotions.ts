import type { Emotion } from "../types";

/**
 * One emotion = one visual pose + one vocal profile, so the face and the
 * voice always belong to the same person. Every field is authored at
 * intensity 1.0 and scaled by the EmotionController.
 */
export interface EmotionPose {
  brow: number; // -1 angled/worried .. 1 raised
  browY: number; // px, negative = up
  browInner: number; // inner-brow lift (sad / worried)
  eyeOpen: number; // multiplier
  squint: number; // 0..1 lower-lid raise
  smile: number; // -1 frown .. 1 grin
  mouthWide: number; // -0.3 pucker .. 0.4 wide
  blush: number; // 0..1
  pupil: number; // iris scale
  lean: number; // -1 back .. 1 forward
  shoulder: number; // -1 slump .. 1 raised
  tilt: number; // head tilt bias, deg
  gazeAway: number; // 0..1 tendency to break eye contact
  energy: number; // motion amplitude multiplier
  tempo: number; // motion speed multiplier
  blinkRate: number; // multiplier on blink frequency
}

export interface VoiceProfile {
  rate: number;
  pitch: number;
  volume: number;
  /** Multiplies punctuation pauses. */
  pauseScale: number;
  /** How much pitch/rate wanders between phrases (prosody life). */
  variance: number;
  /** Probability of a soft filler/hesitation opening a phrase. */
  hesitation: number;
  /** Breath audio level between phrases (0 = none). */
  breath: number;
}

const BASE: EmotionPose = {
  brow: 0.05,
  browY: 0,
  browInner: 0,
  eyeOpen: 1,
  squint: 0,
  smile: 0.25,
  mouthWide: 0,
  blush: 0.45,
  pupil: 1,
  lean: 0.08,
  shoulder: 0.08,
  tilt: 0,
  gazeAway: 0.12,
  energy: 1,
  tempo: 1,
  blinkRate: 1,
};

const pose = (patch: Partial<EmotionPose>): EmotionPose => ({ ...BASE, ...patch });

export const EMOTION_POSE: Record<Emotion, EmotionPose> = {
  neutral: pose({}),
  happy: pose({
    brow: 0.4, browY: -2, eyeOpen: 0.92, squint: 0.25, smile: 1, mouthWide: 0.25,
    blush: 0.8, lean: 0.35, shoulder: 0.25, energy: 1.15, tempo: 1.1,
  }),
  excited: pose({
    brow: 0.85, browY: -5, eyeOpen: 1.12, smile: 1, mouthWide: 0.35, blush: 0.95,
    pupil: 1.08, lean: 0.7, shoulder: 0.55, energy: 1.6, tempo: 1.35, blinkRate: 1.2,
  }),
  surprised: pose({
    brow: 1, browY: -8, eyeOpen: 1.25, smile: 0.05, mouthWide: -0.15, pupil: 1.18,
    lean: -0.6, shoulder: 0.7, energy: 1.3, tempo: 1.4, blinkRate: 0.5,
  }),
  confused: pose({
    brow: -0.45, browY: -1, browInner: 0.35, eyeOpen: 0.96, smile: -0.1,
    tilt: 7, gazeAway: 0.5, lean: -0.12, energy: 0.9, tempo: 0.92,
  }),
  embarrassed: pose({
    brow: -0.3, browY: 1, browInner: 0.5, eyeOpen: 0.86, squint: 0.2, smile: 0.15,
    mouthWide: -0.2, blush: 1, gazeAway: 0.8, lean: -0.25, shoulder: -0.15,
    tilt: -5, energy: 0.75, tempo: 0.9, blinkRate: 1.4,
  }),
  shy: pose({
    brow: -0.15, browInner: 0.4, eyeOpen: 0.82, squint: 0.15, smile: 0.35,
    mouthWide: -0.15, blush: 0.95, gazeAway: 0.7, lean: -0.2, shoulder: -0.1,
    tilt: -6, energy: 0.6, tempo: 0.85, blinkRate: 1.3,
  }),
  sad: pose({
    brow: -0.9, browY: 3, browInner: 0.9, eyeOpen: 0.8, smile: -0.55, mouthWide: -0.1,
    blush: 0.5, lean: -0.3, shoulder: -0.35, tilt: -4, gazeAway: 0.6,
    energy: 0.55, tempo: 0.75, blinkRate: 0.8,
  }),
  angry: pose({
    brow: -1, browY: 4, eyeOpen: 1.05, squint: 0.45, smile: -0.4, mouthWide: 0.1,
    blush: 0.35, pupil: 0.88, lean: 0.55, shoulder: 0.45,
    energy: 1.3, tempo: 1.2, blinkRate: 0.7,
  }),
  alert: pose({
    brow: -0.7, browY: -3, eyeOpen: 1.1, smile: 0.05, pupil: 0.92, lean: 0.5,
    shoulder: 0.45, energy: 1.2, tempo: 1.15, blinkRate: 0.8,
  }),
  worried: pose({
    brow: -0.6, browY: 1, browInner: 0.8, eyeOpen: 0.98, smile: -0.3,
    gazeAway: 0.45, lean: -0.1, shoulder: 0.1, energy: 0.85, tempo: 0.95, blinkRate: 1.3,
  }),
  sleepy: pose({
    brow: -0.1, browY: 2, eyeOpen: 0.55, squint: 0.35, smile: 0.1, blush: 0.5,
    lean: -0.15, shoulder: -0.3, tilt: -7, gazeAway: 0.55,
    energy: 0.45, tempo: 0.6, blinkRate: 1.9,
  }),
  curious: pose({
    brow: 0.6, browY: -4, eyeOpen: 1.08, smile: 0.35, pupil: 1.06, tilt: 8,
    lean: 0.45, gazeAway: 0.3, energy: 1.1, tempo: 1.08,
  }),
  playful: pose({
    brow: 0.5, browY: -3, eyeOpen: 0.95, squint: 0.3, smile: 0.85, mouthWide: 0.3,
    blush: 0.8, tilt: 6, lean: 0.4, shoulder: 0.3, energy: 1.35, tempo: 1.2,
  }),
  thinking: pose({
    brow: -0.25, browY: -1, eyeOpen: 0.93, squint: 0.15, smile: 0.1,
    mouthWide: -0.15, gazeAway: 0.9, tilt: 5, lean: -0.05,
    energy: 0.7, tempo: 0.85, blinkRate: 0.9,
  }),
  proud: pose({
    brow: 0.35, browY: -2, eyeOpen: 0.9, squint: 0.3, smile: 0.7, blush: 0.6,
    lean: 0.15, shoulder: 0.4, tilt: -3, energy: 1.05, tempo: 0.95,
  }),
};

const VOICE_BASE: VoiceProfile = {
  rate: 0.94,
  pitch: 1.14,
  volume: 0.92,
  pauseScale: 1,
  variance: 1,
  hesitation: 0.12,
  breath: 0.5,
};

const voice = (patch: Partial<VoiceProfile>): VoiceProfile => ({ ...VOICE_BASE, ...patch });

export const EMOTION_VOICE: Record<Emotion, VoiceProfile> = {
  neutral: voice({}),
  happy: voice({ rate: 1.0, pitch: 1.24, volume: 0.95, pauseScale: 0.9, variance: 1.2 }),
  excited: voice({ rate: 1.1, pitch: 1.32, volume: 0.98, pauseScale: 0.72, variance: 1.5, hesitation: 0.05 }),
  surprised: voice({ rate: 1.06, pitch: 1.34, volume: 0.97, pauseScale: 0.8, variance: 1.4, hesitation: 0.04 }),
  confused: voice({ rate: 0.88, pitch: 1.12, volume: 0.88, pauseScale: 1.35, variance: 1.1, hesitation: 0.4 }),
  embarrassed: voice({ rate: 0.88, pitch: 1.2, volume: 0.76, pauseScale: 1.3, variance: 0.9, hesitation: 0.45, breath: 0.7 }),
  shy: voice({ rate: 0.86, pitch: 1.18, volume: 0.7, pauseScale: 1.35, variance: 0.8, hesitation: 0.4, breath: 0.7 }),
  sad: voice({ rate: 0.8, pitch: 1.04, volume: 0.74, pauseScale: 1.6, variance: 0.7, hesitation: 0.3, breath: 0.8 }),
  angry: voice({ rate: 1.04, pitch: 1.06, volume: 0.99, pauseScale: 0.75, variance: 1.2, hesitation: 0.02 }),
  alert: voice({ rate: 0.98, pitch: 1.1, volume: 0.95, pauseScale: 0.85, variance: 1 }),
  worried: voice({ rate: 0.9, pitch: 1.16, volume: 0.84, pauseScale: 1.25, variance: 1, hesitation: 0.35 }),
  sleepy: voice({ rate: 0.72, pitch: 1.02, volume: 0.7, pauseScale: 1.8, variance: 0.6, hesitation: 0.5, breath: 0.9 }),
  curious: voice({ rate: 0.96, pitch: 1.26, volume: 0.92, pauseScale: 1.05, variance: 1.25, hesitation: 0.2 }),
  playful: voice({ rate: 1.04, pitch: 1.28, volume: 0.94, pauseScale: 0.85, variance: 1.45, hesitation: 0.15 }),
  thinking: voice({ rate: 0.86, pitch: 1.1, volume: 0.86, pauseScale: 1.5, variance: 1, hesitation: 0.55, breath: 0.7 }),
  proud: voice({ rate: 0.92, pitch: 1.16, volume: 0.95, pauseScale: 1.05, variance: 1.1, hesitation: 0.08 }),
};

/** Blend an authored pose toward neutral by intensity (0..1). */
export function scalePose(target: EmotionPose, intensity: number): EmotionPose {
  const t = Math.max(0, Math.min(1, intensity));
  const out = {} as EmotionPose;
  (Object.keys(BASE) as (keyof EmotionPose)[]).forEach((key) => {
    out[key] = BASE[key] + (target[key] - BASE[key]) * t;
  });
  return out;
}

/** Blend a voice profile toward neutral by intensity (0..1). */
export function scaleVoice(target: VoiceProfile, intensity: number): VoiceProfile {
  const t = Math.max(0, Math.min(1, intensity));
  const out = {} as VoiceProfile;
  (Object.keys(VOICE_BASE) as (keyof VoiceProfile)[]).forEach((key) => {
    out[key] = VOICE_BASE[key] + (target[key] - VOICE_BASE[key]) * t;
  });
  return out;
}

/** Iris tint per emotion — subtle, keeps the soft grey anime look. */
export const IRIS: Record<Emotion, [string, string]> = {
  neutral: ["#b9bdc4", "#4b4f58"],
  happy: ["#c6c9cf", "#55585f"],
  excited: ["#d0cfc6", "#5a5449"],
  surprised: ["#c9ccd3", "#3f434b"],
  confused: ["#bcb9c6", "#4e4a5a"],
  embarrassed: ["#c9bcc0", "#584a51"],
  shy: ["#c7bcc2", "#564a52"],
  sad: ["#b3b9c6", "#474d5b"],
  angry: ["#c4b3b3", "#5a4444"],
  alert: ["#c8bfb2", "#5b5045"],
  worried: ["#b7bcc9", "#4a4f5d"],
  sleepy: ["#b0b2bc", "#4a4b55"],
  curious: ["#bfc8d4", "#4a5462"],
  playful: ["#c3bfd4", "#524d66"],
  thinking: ["#b8bcc7", "#4b4f5b"],
  proud: ["#c9c2b4", "#585046"],
};