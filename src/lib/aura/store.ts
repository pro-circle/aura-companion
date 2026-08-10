import { create } from "zustand";

import type {
  AvatarState,
  ChatMessage,
  ConnectionState,
  Emotion,
  PoolStatus,
  SceneContext,
} from "./types";

export interface PrivacySettings {
  camera: boolean;
  microphone: boolean;
  onDeviceOnly: boolean;
  voice: boolean;
}

interface AuraStore {
  sessionId: string;
  connection: ConnectionState;
  avatarState: AvatarState;
  emotion: Emotion;
  messages: ChatMessage[];
  context: SceneContext;
  pool: PoolStatus | null;
  privacy: PrivacySettings;
  lastError: string | null;

  setConnection: (state: ConnectionState) => void;
  setAvatarState: (state: AvatarState) => void;
  setEmotion: (emotion: Emotion) => void;
  addMessage: (message: Omit<ChatMessage, "id" | "at">) => void;
  clearMessages: () => void;
  patchContext: (patch: Partial<SceneContext>) => void;
  setPool: (pool: PoolStatus | null) => void;
  togglePrivacy: (key: keyof PrivacySettings) => void;
  setError: (message: string | null) => void;
}

const emptyContext: SceneContext = {
  people: 0,
  face_present: false,
  user_emotion: "neutral",
  scene_tags: [],
  luminance: null,
  local_time: null,
  day_part: null,
  weather: null,
  mic_state: "idle",
};

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useAuraStore = create<AuraStore>((set) => ({
  sessionId: newId(),
  connection: "connecting",
  avatarState: "idle",
  emotion: "neutral",
  messages: [],
  context: emptyContext,
  pool: null,
  privacy: {
    camera: false,
    microphone: true,
    onDeviceOnly: true,
    voice: true,
  },
  lastError: null,

  setConnection: (connection) => set({ connection }),
  setAvatarState: (avatarState) => set({ avatarState }),
  setEmotion: (emotion) => set({ emotion }),
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, { ...message, id: newId(), at: Date.now() }].slice(-40),
    })),
  clearMessages: () => set({ messages: [] }),
  patchContext: (patch) => set((state) => ({ context: { ...state.context, ...patch } })),
  setPool: (pool) => set({ pool }),
  togglePrivacy: (key) =>
    set((state) => ({ privacy: { ...state.privacy, [key]: !state.privacy[key] } })),
  setError: (lastError) => set({ lastError }),
}));
