export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

export type Emotion =
  | "neutral"
  | "happy"
  | "surprised"
  | "confused"
  | "alert"
  | "sad";

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
};

export const BACKEND_URL =
  (import.meta.env["VITE_AURA_BACKEND_URL"] as string | undefined) ??
  "http://localhost:8000";

export function backendWsUrl(sessionId: string): string {
  const base = BACKEND_URL.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/ws/avatar?session_id=${encodeURIComponent(sessionId)}`;
}
