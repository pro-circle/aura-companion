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

/**
 * Ask for the microphone up front.
 *
 * SpeechRecognition triggers its own permission prompt, but inside an iframe
 * (the Lovable preview) or on a page that has never touched getUserMedia it
 * often fails silently with `not-allowed`. Requesting the stream first gives
 * us a real, reportable reason.
 */
export async function requestMicAccess(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "This browser can't access a microphone." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // We only needed the permission grant; recognition opens its own stream.
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true };
  } catch (error) {
    const name = (error as { name?: string })?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      const framed = typeof window !== "undefined" && window.self !== window.top;
      return {
        ok: false,
        reason: framed
          ? "The preview frame blocked the microphone — open the app in its own tab to talk."
          : "Microphone permission was denied. Allow it in your browser's site settings.",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { ok: false, reason: "No microphone found on this device." };
    }
    return { ok: false, reason: "Couldn't open the microphone." };
  }
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
        return;
      }
      if (code === "network") {
        stopped = true;
        handlers.onError?.("Speech recognition needs a network connection.");
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
