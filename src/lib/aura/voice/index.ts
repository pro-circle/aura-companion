import { EMOTION_VOICE, scaleVoice, type VoiceProfile } from "../rig/emotions";
import { rand } from "../rig/math";
import { rig } from "../rig/rig";
import { estimateWordDuration } from "../rig/visemes";
import type { Emotion } from "../types";
import { audioEngine } from "./audio-engine";
import { activeEngine, selectEngine, webSpeech } from "./engine";

/**
 * Prosody pipeline: text -> phrases -> emotional TTS chunks -> immediate
 * playback, with the rig driven word-by-word as the audio plays.
 *
 * Nothing waits for the whole reply: the first phrase starts speaking (and
 * the avatar starts moving) while later phrases are still being synthesised.
 */

export interface SpeakOptions {
  emotion?: Emotion;
  intensity?: number;
  onStart?: () => void;
  /** New phrase begins — drives the subtitle line. */
  onCaption?: (phrase: string) => void;
  /** Word index within the current phrase. */
  onWord?: (index: number) => void;
  onEnd?: () => void;
}

interface Phrase {
  text: string;
  /** Seconds of silence after this phrase. */
  pause: number;
  question: boolean;
  exclaim: boolean;
}

const FILLERS = ["Well,", "Hmm,", "So,", "I mean,", "Okay so,", "Honestly,"];

/** Split into speakable phrases with punctuation-driven pauses. */
export function segment(text: string): Phrase[] {
  const clean = text
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];

  const chunks = clean.match(/[^.!?…]+[.!?…]*/g) ?? [clean];
  const phrases: Phrase[] = [];

  chunks.forEach((chunk) => {
    const sentence = chunk.trim();
    if (!sentence) return;
    // Break long sentences at clause boundaries so breathing feels human.
    const parts = sentence.length > 90 ? sentence.split(/(?<=[,;:—])\s+/) : [sentence];
    parts.forEach((raw, index) => {
      const part = raw.trim();
      if (!part) return;
      const last = index === parts.length - 1;
      const question = /\?\s*$/.test(part);
      const exclaim = /!\s*$/.test(part);
      const pause = last
        ? question ? 0.4 : exclaim ? 0.32 : /[.…]$/.test(part) ? 0.36 : 0.22
        : /[—:;]$/.test(part) ? 0.26 : 0.16;
      phrases.push({ text: part, pause, question, exclaim });
    });
  });
  return phrases;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let token = 0;
let levelTimer: ReturnType<typeof setInterval> | null = null;

function startLevelPump() {
  stopLevelPump();
  levelTimer = setInterval(() => {
    const engine = activeEngine();
    rig.setAudioLevel(engine ? engine.level() : 0);
  }, 40);
}

function stopLevelPump() {
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = null;
  rig.setAudioLevel(0);
}

/** Emphasised words get a stronger viseme + a facial accent. */
function stressOf(word: string, index: number, total: number): number {
  const bare = word.replace(/[^A-Za-z']/g, "");
  if (!bare) return 0.6;
  if (/[!?]$/.test(word)) return 0.95;
  if (bare.length >= 7) return 0.9;
  if (index === total - 1) return 0.85;
  if (index === 0) return 0.8;
  return 0.6 + (bare.length > 4 ? 0.12 : 0);
}

/**
 * Speak a reply with emotional prosody, streaming phrase by phrase and
 * driving the avatar rig (visemes, accents, gestures) in step with the audio.
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const clean = text.trim();
  stopSpeaking();
  if (!clean) {
    options.onEnd?.();
    return;
  }

  const mine = ++token;
  const emotion = options.emotion ?? "neutral";
  const intensity = options.intensity ?? 0.85;
  const profile: VoiceProfile = scaleVoice(EMOTION_VOICE[emotion] ?? EMOTION_VOICE.neutral, intensity);

  const engine = await selectEngine();
  if (mine !== token) return;

  const phrases = segment(clean);
  rig.setEmotion(emotion, intensity);
  rig.beginSpeech();
  startLevelPump();
  options.onStart?.();

  for (let i = 0; i < phrases.length; i += 1) {
    if (mine !== token) return;
    const phrase = phrases[i]!;

    // Occasional hesitation makes her sound like she's thinking, not reading.
    const hesitate = i === 0 && Math.random() < profile.hesitation;
    const spoken = hesitate
      ? `${FILLERS[Math.floor(Math.random() * FILLERS.length)]} ${phrase.text}`
      : phrase.text;

    // Per-phrase micro-variation: never the same rate/pitch/volume twice.
    const v = profile.variance;
    const tail = i === phrases.length - 1 ? -0.04 : 0;
    const rateScale = 1 + rand(-0.05, 0.07) * v + (phrase.question ? -0.02 : 0);
    const pitchScale = 1 + rand(-0.03, 0.05) * v + (phrase.question ? 0.07 : 0) + (phrase.exclaim ? 0.04 : 0);
    const volumeScale = 1 + rand(-0.04, 0.03) * v + tail;

    options.onCaption?.(phrase.text);
    options.onWord?.(0);
    if (phrase.question) rig.accent("question");
    if (phrase.exclaim) rig.accent("exclaim");

    const list = spoken.split(/\s+/).filter(Boolean);
    const offset = hesitate ? 1 : 0;

    // eslint-disable-next-line no-await-in-loop -- phrases are sequential by design
    await engine.speak({
      text: spoken,
      profile,
      rateScale,
      pitchScale,
      volumeScale,
      onWord: (index, word, wordDuration) => {
        if (mine !== token) return;
        const actual = word || list[index] || "";
        const duration = wordDuration || estimateWordDuration(actual, profile.rate * rateScale);
        rig.speakWord(actual, duration, 0, stressOf(actual, index, list.length));
        options.onWord?.(Math.max(0, index - offset));
      },
    });
    if (mine !== token) return;

    // A tiny, almost inaudible breath, then the punctuation pause.
    const pause = phrase.pause * profile.pauseScale;
    if (profile.breath > 0.05 && pause > 0.25 && Math.random() < 0.55) {
      audioEngine.breath(profile.breath * 0.9, undefined, i < phrases.length - 1);
    }
    // eslint-disable-next-line no-await-in-loop -- natural inter-phrase pause
    await sleep(pause * 1000);
  }

  if (mine !== token) return;
  stopLevelPump();
  rig.endSpeech();
  options.onCaption?.("");
  options.onEnd?.();
}

export function stopSpeaking(): void {
  token += 1;
  stopLevelPump();
  activeEngine()?.cancel();
  webSpeech.cancel();
  audioEngine.stopAll();
  rig.endSpeech();
}

export function isSpeaking(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis.speaking
    : false;
}

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Warm the browser voice list early (Chrome loads it asynchronously).
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    webSpeech.refreshVoice();
    window.speechSynthesis.getVoices();
  };
}

export { audioEngine } from "./audio-engine";
export { ENGINES, activeEngine, selectEngine, useEngine } from "./engine";