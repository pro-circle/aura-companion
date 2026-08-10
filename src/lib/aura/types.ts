export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

/** Emotions the backend can send (kept in sync with backend/app/schemas.py). */
export type BackendEmotion =
  | "neutral"
  | "happy"
  | "surprised"
  | "confused"
  | "alert"
  | "sad";

/** Full expressive palette the rig + voice can perform locally. */
export type Emotion =
  | BackendEmotion
  | "excited"
  | "embarrassed"
  | "shy"
  | "angry"
  | "worried"
  | "sleepy"
  | "curious"
  | "playful"
  | "thinking"
  | "proud";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "offline"
  | "reconnecting";

export interface SceneContext {
  people: number;
  face_present: boolean;
  user_emotion: Emotion;
  scene_tags: string[];
  luminance: number | null;
  local_time: string | null;
  day_part: string | null;
  weather: string | null;
  mic_state: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion: Emotion;
  at: number;
}

export interface KeyStat {
  provider: string;
  key: string;
  requests: number;
  failures: number;
  healthy: boolean;
  cooldown_remaining: number;
}

export interface PoolStatus {
  groq_keys: number;
  openrouter_keys: number;
  groq_healthy: boolean;
  openrouter_healthy: boolean;
  keys: KeyStat[];
}

export interface AuraReplyEvent {
  type: "reply";
  response: string;
  emotion: Emotion;
  animation_state: AvatarState;
  speech_required: boolean;
  priority: "low" | "normal" | "high";
  pool?: PoolStatus;
}

export type ServerEvent =
  | { type: "ready"; session_id: string; avatar_state: AvatarState; pool?: PoolStatus }
  | { type: "state"; avatar_state: AvatarState }
  | { type: "cleared" }
  | { type: "error"; message: string }
  | AuraReplyEvent;

export const EMOTION_COLOR: Record<Emotion, string> = {
  neutral: "#4fd6e0",
  happy: "#5be3a7",
  surprised: "#8ab4ff",
  confused: "#c08bff",
  alert: "#ffb15c",
  sad: "#6f8bd6",
  excited: "#ffd166",
  embarrassed: "#ff9db3",
  shy: "#ffb3c9",
  angry: "#ff6b6b",
  worried: "#9aa7d6",
  sleepy: "#8f8fb0",
  curious: "#7fd1ff",
  playful: "#a78bfa",
  thinking: "#9db7d6",
  proud: "#f2c14e",
};

export const BACKEND_URL =
  (import.meta.env["VITE_AURA_BACKEND_URL"] as string | undefined) ??
  "http://localhost:8000";

export function backendWsUrl(sessionId: string): string {
  const base = BACKEND_URL.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/ws/avatar?session_id=${encodeURIComponent(sessionId)}`;
}
