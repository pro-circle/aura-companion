/**
 * Browser Web Speech helpers — free, zero-latency, no API key.
 *
 * TTS: emotion-aware voice shaping (rate / pitch / volume + clause pacing)
 *      and a live "speech level" signal the avatar uses for lip sync.
 * STT: continuous streaming recognition with interim transcripts.
 */

import type { Emotion } from "./types";

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
};

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function recognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/* ------------------------------------------------------------------ lip sync */

let speechLevel = 0;
let levelTimer: ReturnType<typeof setInterval> | null = null;

/** 0..1 mouth-openness envelope, driven by the utterance's progress. */
export function getSpeechLevel(): number {
  return speechLevel;
}

function startLevel() {
  stopLevel();
  levelTimer = setInterval(() => {
    // Web Speech gives no PCM, so synthesise a natural syllabic envelope.
    speechLevel = 0.45 + Math.random() * 0.55;
  }, 90);
}

function stopLevel() {
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = null;
  speechLevel = 0;
}

/* ---------------------------------------------------------------------- TTS */

interface VoiceShape {
  rate: number;
  pitch: number;
  volume: number;
}

const EMOTION_VOICE: Record<Emotion, VoiceShape> = {
  neutral: { rate: 1.0, pitch: 1.06, volume: 1 },
  happy: { rate: 1.12, pitch: 1.28, volume: 1 },
  surprised: { rate: 1.18, pitch: 1.42, volume: 1 },
  confused: { rate: 0.94, pitch: 1.0, volume: 0.95 },
  alert: { rate: 1.08, pitch: 0.94, volume: 1 },
  sad: { rate: 0.86, pitch: 0.9, volume: 0.85 },
};

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred =
    voices.find((v) => /google uk english female|samantha|ava|aria|zira|jenny/i.test(v.name)) ??
    voices.find((v) => /female/i.test(v.name) && v.lang.startsWith("en")) ??
    voices.find((v) => v.lang.startsWith("en-GB")) ??
    voices.find((v) => v.lang.startsWith("en"));
  return preferred ?? voices[0] ?? null;
}

/** Split into clauses so we can vary tone across a sentence (less robotic). */
function clauses(text: string): string[] {
  return text
    .replace(/[*_`#>]/g, "")
    .split(/(?<=[.!?,;:—])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

let speakToken = 0;

export function speak(
  text: string,
  options: { emotion?: Emotion; onStart?: () => void; onEnd?: () => void } = {},
): void {
  const clean = text.trim();
  if (!speechSupported() || !clean) {
    options.onEnd?.();
    return;
  }

  stopSpeaking();
  const token = ++speakToken;
  const shape = EMOTION_VOICE[options.emotion ?? "neutral"];
  const voice = pickVoice();
  const parts = clauses(clean);
  let started = false;

  parts.forEach((part, index) => {
    const utterance = new SpeechSynthesisUtterance(part);
    if (voice) utterance.voice = voice;
    // Micro-variation per clause keeps the delivery human.
    const drift = (index % 3) - 1;
    const question = /\?$/.test(part);
    const exclaim = /!$/.test(part);
    utterance.rate = shape.rate + drift * 0.03 + (exclaim ? 0.05 : 0);
    utterance.pitch = Math.max(
      0.1,
      shape.pitch + drift * 0.05 + (question ? 0.16 : 0) + (exclaim ? 0.1 : 0),
    );
    utterance.volume = shape.volume;

    utterance.onstart = () => {
      if (token !== speakToken) return;
      startLevel();
      if (!started) {
        started = true;
        options.onStart?.();
      }
    };
    utterance.onend = () => {
      if (token !== speakToken) return;
      if (index === parts.length - 1) {
        stopLevel();
        options.onEnd?.();
      }
    };
    utterance.onerror = () => {
      if (token !== speakToken) return;
      if (index === parts.length - 1) {
        stopLevel();
        options.onEnd?.();
      }
    };

    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  speakToken += 1;
  stopLevel();
  if (speechSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return speechSupported() && window.speechSynthesis.speaking;
}

// Warm the voice list up early (Chrome loads it asynchronously).
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

/* ---------------------------------------------------------------------- STT */

export interface StreamHandlers {
  /** Fired on every partial hypothesis. */
  onInterim?: (text: string) => void;
  /** Fired when a phrase is finalised. */
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

export interface VoiceStream {
  stop: () => void;
}

/**
 * Continuous voice streaming: keeps the recogniser alive across pauses and
 * emits interim text as the user speaks.
 */
export function startVoiceStream(handlers: StreamHandlers): VoiceStream | null {
  if (!recognitionSupported()) {
    handlers.onError?.("Voice input isn't supported in this browser.");
    return null;
  }
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;

  let stopped = false;
  let recognition: RecognitionLike | null = null;

  const build = () => {
    const rec: RecognitionLike = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = String(result[0].transcript);
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) handlers.onFinal?.(finalText);
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) handlers.onInterim?.(interim.trim());
    };

    rec.onerror = (event: any) => {
      const code = event?.error as string | undefined;
      if (code === "no-speech" || code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        stopped = true;
        handlers.onError?.("Microphone permission denied.");
      }
    };

    rec.onend = () => {
      if (stopped) {
        handlers.onEnd?.();
        return;
      }
      // Browsers cut the stream after silence — restart to keep it live.
      setTimeout(() => {
        if (stopped) return;
        try {
          recognition = build();
          recognition.start();
        } catch {
          stopped = true;
          handlers.onEnd?.();
        }
      }, 220);
    };

    return rec;
  };

  try {
    recognition = build();
    recognition.start();
  } catch {
    handlers.onError?.("Couldn't start the microphone.");
    return null;
  }

  return {
    stop: () => {
      stopped = true;
      try {
        recognition?.stop();
      } catch {
        /* already stopped */
      }
      recognition = null;
    },
  };
}
