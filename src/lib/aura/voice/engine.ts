import type { VoiceProfile } from "../rig/emotions";
import { audioEngine } from "./audio-engine";

/**
 * Modular voice engine layer.
 *
 *   VoiceEngine
 *     ├── Kokoro   (local, WebGPU/WASM, kokoro-js)  — preferred
 *     ├── Piper    (local, ONNX/WASM)               — second choice
 *     └── WebSpeech (browser built-in)              — always-available fallback
 *
 * Everything runs locally in the browser; no paid cloud voice API.
 * Engines are loaded lazily from a CDN so nothing bloats the bundle, and a
 * missing model simply falls through to the next engine.
 */

export interface SpeakRequest {
  /** One phrase, already segmented by the prosody pipeline. */
  text: string;
  profile: VoiceProfile;
  /** Per-phrase micro-variation multipliers. */
  rateScale: number;
  pitchScale: number;
  volumeScale: number;
  onStart?: (info: { duration: number }) => void;
  /** index = word index in this phrase. */
  onWord?: (index: number, word: string, wordDuration: number) => void;
  onEnd?: () => void;
}

export interface VoiceEngine {
  readonly id: string;
  readonly label: string;
  /** True when the engine can actually synthesise right now. */
  isAvailable(): Promise<boolean>;
  speak(request: SpeakRequest): Promise<void>;
  cancel(): void;
  /** Live output level 0..1 for lip-sync fallback, if the engine has PCM. */
  level(): number;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/* -------------------------------------------------------------- WebSpeech */

/** Browser SpeechSynthesis. Zero latency, gives real word boundaries. */
export class WebSpeechEngine implements VoiceEngine {
  readonly id = "webspeech";
  readonly label = "Browser voice";
  private voice: SpeechSynthesisVoice | null = null;
  private token = 0;
  private lvl = 0;
  private levelTimer: ReturnType<typeof setInterval> | null = null;

  async isAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (this.voice) return this.voice;
    const all = window.speechSynthesis.getVoices();
    if (!all.length) return null;
    const male =
      /(male\b|\bman\b|david|mark|guy|george|james|ryan|daniel|alex(?!a)|fred|thomas|william|christopher|eric|arthur|oliver|liam|brian|paul|tom|john|matthew|aaron|roger|steffan|rishi|prabhat|gordon|junior|reed|onyx|echo|ash)/i;
    const female =
      /(female|woman|aria|jenny|ava|libby|sonia|emma|michelle|amber|ana|nova|shimmer|samantha|serena|allison|susan|karen|moira|tessa|fiona|victoria|zira|hazel|catherine|linda|nanami|neerja|heera|kalpana|swara|joanna|salli|kendra|kimberly|ivy|amy|lucia|elsa)/i;
    const english = all.filter((v) => /^en/i.test(v.lang));
    const pool = english.length ? english : all;
    const fem = pool.filter((v) => female.test(v.name) && !male.test(v.name));
    const notMale = pool.filter((v) => !male.test(v.name));
    this.voice =
      fem.find((v) => /(natural|neural|online)/i.test(v.name)) ??
      fem.find((v) => /^en-US/i.test(v.lang)) ??
      fem[0] ??
      notMale.find((v) => /google (uk|us) english/i.test(v.name)) ??
      notMale[0] ??
      pool[0] ??
      null;
    return this.voice;
  }

  refreshVoice() {
    this.voice = null;
  }

  level(): number {
    return this.lvl;
  }

  speak(request: SpeakRequest): Promise<void> {
    const token = ++this.token;
    const { profile } = request;
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(request.text);
      const voice = this.pickVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = Math.max(0.4, profile.rate * request.rateScale);
      utterance.pitch = Math.max(1.0, profile.pitch * request.pitchScale);
      utterance.volume = Math.min(1, profile.volume * request.volumeScale);

      const list = words(request.text);
      const estimated = request.text.length / (13 * utterance.rate);
      let lastIndex = -1;
      let settled = false;
      let watchdog: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (watchdog) clearTimeout(watchdog);
        if (token === this.token) {
          this.stopLevel();
          request.onEnd?.();
        }
        resolve();
      };

      // Some environments never fire onend (no installed voices) — never hang.
      watchdog = setTimeout(finish, (estimated + 4) * 1000);

      utterance.onstart = () => {
        if (token !== this.token) return;
        this.startLevel();
        request.onStart?.({ duration: estimated });
      };
      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (token !== this.token) return;
        if (event.name && event.name !== "word") return;
        const spoken = request.text.slice(0, event.charIndex ?? 0);
        const index = spoken.trim() ? spoken.trim().split(/\s+/).length : 0;
        if (index === lastIndex) return;
        lastIndex = index;
        const word = list[index] ?? "";
        request.onWord?.(index, word, (word.length + 1) / (13 * utterance.rate));
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      window.speechSynthesis.speak(utterance);
    });
  }

  cancel() {
    this.token += 1;
    this.stopLevel();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  private startLevel() {
    this.stopLevel();
    // SpeechSynthesis exposes no PCM; the rig prefers viseme timing anyway.
    this.levelTimer = setInterval(() => {
      this.lvl = 0.45 + Math.random() * 0.5;
    }, 80);
  }

  private stopLevel() {
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
    this.lvl = 0;
  }
}

/* ---------------------------------------------------------- local (PCM) */

interface LocalSynth {
  synth: (text: string, opts: { speed: number }) => Promise<{ audio: Float32Array; sampleRate: number }>;
}

/** Shared playback path for engines that produce raw PCM locally. */
abstract class PcmEngine implements VoiceEngine {
  abstract readonly id: string;
  abstract readonly label: string;
  protected synth: LocalSynth | null = null;
  protected loading: Promise<LocalSynth | null> | null = null;
  private token = 0;

  protected abstract load(): Promise<LocalSynth | null>;

  async isAvailable(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (!this.loading) this.loading = this.load().catch(() => null);
    this.synth = await this.loading;
    return Boolean(this.synth);
  }

  level(): number {
    return audioEngine.analyse();
  }

  async speak(request: SpeakRequest): Promise<void> {
    const token = ++this.token;
    if (!this.synth) return;
    const speed = Math.max(0.5, request.profile.rate * request.rateScale);
    const result = await this.synth.synth(request.text, { speed });
    if (token !== this.token) return;

    await audioEngine.resume();
    const buffer = audioEngine.fromPCM(result.audio, result.sampleRate);
    const gain = Math.min(1, request.profile.volume * request.volumeScale);

    return new Promise<void>((resolve) => {
      const { startAt, duration } = audioEngine.play(buffer, {
        gain,
        onEnded: () => {
          if (token !== this.token) return;
          request.onEnd?.();
          resolve();
        },
      });
      request.onStart?.({ duration });

      // Distribute word timings across the real audio duration.
      const list = words(request.text);
      const weights = list.map((w) => w.replace(/[^\w']/g, "").length + 1.6);
      const total = weights.reduce((a, b) => a + b, 0) || 1;
      let offset = 0;
      const base = audioEngine.now();
      list.forEach((word, index) => {
        const share = ((weights[index] ?? 1) / total) * duration;
        const when = startAt - base + offset;
        offset += share;
        setTimeout(() => {
          if (token !== this.token) return;
          request.onWord?.(index, word, share);
        }, Math.max(0, when * 1000));
      });
    });
  }

  cancel() {
    this.token += 1;
    audioEngine.stopAll();
  }
}

/**
 * Kokoro-82M running locally in the browser (kokoro-js, Apache-2.0).
 *
 * The model (~86MB, q8) is fetched from the Hugging Face CDN on first use and
 * then cached by the browser. WebGPU is used when the browser exposes it,
 * otherwise it runs on WASM. Nothing is sent to a server and nothing is paid
 * for. Until the model is ready the pipeline keeps using the browser voice,
 * so the very first reply is never delayed.
 *
 * Override with `window.AURA_KOKORO = { model, voice, dtype, device }`.
 */
export class KokoroEngine extends PcmEngine {
  readonly id = "kokoro";
  readonly label = "Kokoro (local)";

  protected async load(): Promise<LocalSynth | null> {
    const cfg = (window as unknown as {
      AURA_KOKORO?: { model?: string; voice?: string; dtype?: string; device?: string };
    }).AURA_KOKORO ?? {};

    const webgpu = "gpu" in navigator && Boolean((navigator as unknown as { gpu?: unknown }).gpu);
    const device = (cfg.device ?? (webgpu ? "webgpu" : "wasm")) as "webgpu" | "wasm";
    const dtype = cfg.dtype ?? (device === "webgpu" ? "fp32" : "q8");

    const { KokoroTTS } = await import("kokoro-js");
    const tts = await KokoroTTS.from_pretrained(
      cfg.model ?? "onnx-community/Kokoro-82M-v1.0-ONNX",
      { dtype, device } as Parameters<typeof KokoroTTS.from_pretrained>[1],
    );

    // af_heart: warm, natural American female — the closest match to the
    // soft anime-companion tone the rest of the rig is tuned for.
    const voice = (cfg.voice ?? "af_heart") as NonNullable<
      NonNullable<Parameters<typeof tts.generate>[1]>["voice"]
    >;
    return {
      synth: async (text, opts) => {
        const out = await tts.generate(text, { voice, speed: opts.speed });
        return { audio: out.audio as Float32Array, sampleRate: out.sampling_rate };
      },
    };
  }
}

/**
 * Piper voices via a local ONNX/WASM worker (MIT). Opt-in through
 * `window.AURA_PIPER = { module, voiceUrl }`.
 */
export class PiperEngine extends PcmEngine {
  readonly id = "piper";
  readonly label = "Piper (local)";

  protected async load(): Promise<LocalSynth | null> {
    const cfg = (window as unknown as {
      AURA_PIPER?: { module?: string; voiceUrl?: string };
    }).AURA_PIPER;
    if (!cfg?.module) return null;

    const mod = (await import(/* @vite-ignore */ cfg.module)) as {
      predict: (opts: Record<string, unknown>) => Promise<{ audio: Float32Array; sampleRate: number }>;
    };
    return {
      synth: async (text, opts) =>
        mod.predict({ text, voiceUrl: cfg.voiceUrl, lengthScale: 1 / opts.speed }),
    };
  }
}

/* -------------------------------------------------------------- registry */

export const webSpeech = new WebSpeechEngine();
export const kokoro = new KokoroEngine();
export const piper = new PiperEngine();

/** Priority order: local neural voices first, browser voice as the fallback. */
export const ENGINES: VoiceEngine[] = [kokoro, piper, webSpeech];

let resolved: VoiceEngine | null = null;
let upgrading = false;
const listeners = new Set<(engine: VoiceEngine) => void>();

export function onEngineChange(fn: (engine: VoiceEngine) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce(engine: VoiceEngine) {
  listeners.forEach((fn) => fn(engine));
}

/**
 * Warm the best local engine in the background. Speaking never waits for it:
 * `selectEngine()` hands back the browser voice immediately and swaps to
 * Kokoro the moment the model finishes downloading.
 */
export function warmUpVoice(): void {
  if (upgrading || resolved === kokoro) return;
  upgrading = true;
  void (async () => {
    for (const engine of [kokoro, piper]) {
      try {
        // eslint-disable-next-line no-await-in-loop -- ordered preference probe
        if (await engine.isAvailable()) {
          resolved = engine;
          announce(engine);
          return;
        }
      } catch {
        /* try the next one */
      }
    }
  })().finally(() => {
    upgrading = false;
  });
}

export async function selectEngine(): Promise<VoiceEngine> {
  if (resolved) return resolved;
  // Never block the first line on an 86MB download.
  warmUpVoice();
  if (await webSpeech.isAvailable()) {
    resolved = webSpeech;
    return webSpeech;
  }
  resolved = webSpeech;
  return webSpeech;
}

/** Swap voices at runtime (e.g. once a Kokoro model has been configured). */
export function useEngine(id: string) {
  const found = ENGINES.find((engine) => engine.id === id);
  if (found) {
    resolved = found;
    announce(found);
  }
}

export function activeEngine(): VoiceEngine | null {
  return resolved;
}