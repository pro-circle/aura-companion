/**
 * Speech facade.
 *
 * TTS now lives in `./voice` (modular local engines + emotional prosody
 * pipeline + Web Audio graph); this module re-exports it so existing callers
 * keep working, and owns the streaming speech-recognition side.
 */

import { activeEngine } from "./voice/engine";

export { speak, stopSpeaking, isSpeaking } from "./voice";
export type { SpeakOptions } from "./voice";

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function recognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** 0..1 mouth-openness envelope from the active voice engine. */
export function getSpeechLevel(): number {
  return activeEngine()?.level() ?? 0;
}

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
