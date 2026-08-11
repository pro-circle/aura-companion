import { useCallback, useEffect, useRef } from "react";

import { askAura } from "./brain.functions";
import { useAuraStore } from "./store";
import { speak, stopSpeaking } from "./speech";
import { backendWsUrl, type Emotion, type SceneContext, type ServerEvent } from "./types";

/**
 * Perform a reply: caption it, emote it, speak it. Shared by the FastAPI
 * socket and the built-in fallback brain so both sound identical.
 */
function perform(
  response: string,
  emotion: Emotion,
  priority: "low" | "normal" | "high",
  speechRequired = true,
) {
  const s = useAuraStore.getState();
  s.setEmotion(emotion);
  s.addMessage({ role: "assistant", content: response, emotion });

  if (!speechRequired || !s.privacy.voice) {
    s.setCaption("");
    s.setAvatarState("idle");
    return;
  }
  s.setAvatarState("speaking");
  void speak(response, {
    emotion,
    intensity: priority === "high" ? 1 : priority === "low" ? 0.6 : 0.85,
    onCaption: (line) => useAuraStore.getState().setCaption(line),
    onWord: (index) => useAuraStore.getState().setCaptionWord(index),
    onEnd: () => {
      const st = useAuraStore.getState();
      st.setCaption("");
      st.setAvatarState("idle");
    },
  });
}

/** Compact scene description handed to the fallback brain. */
function sceneSummary(): string | undefined {
  const { context } = useAuraStore.getState();
  const bits = [
    context.day_part ? `time of day: ${context.day_part}` : null,
    context.face_present ? "the user's face is visible" : null,
    context.people > 1 ? `${context.people} people on camera` : null,
    context.mic_state === "listening" ? "the user is speaking out loud" : null,
    context.scene_tags.length ? `scene: ${context.scene_tags.join(", ")}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join("; ") : undefined;
}

/**
 * Real-time link to the AURA FastAPI backend.
 * Auto-reconnects with backoff and degrades to an "offline" banner.
 */
export function useAuraConnection() {
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionId = useAuraStore((s) => s.sessionId);

  useEffect(() => {
    closedRef.current = false;
    const store = useAuraStore.getState();

    const connect = () => {
      if (closedRef.current) return;
      store.setConnection(retryRef.current === 0 ? "connecting" : "reconnecting");

      let socket: WebSocket;
      try {
        socket = new WebSocket(backendWsUrl(sessionId));
      } catch {
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        useAuraStore.getState().setConnection("connected");
        useAuraStore.getState().setError(null);
      };

      socket.onmessage = (event) => {
        let data: ServerEvent;
        try {
          data = JSON.parse(event.data as string) as ServerEvent;
        } catch {
          return;
        }
        const s = useAuraStore.getState();

        if (data.type === "ready") {
          s.setAvatarState(data.avatar_state);
          if (data.pool) s.setPool(data.pool);
          return;
        }
        if (data.type === "state") {
          s.setAvatarState(data.avatar_state);
          return;
        }
        if (data.type === "error") {
          s.setError(data.message);
          s.setAvatarState("idle");
          return;
        }
        if (data.type === "reply") {
          if (data.pool) s.setPool(data.pool);
          perform(data.response, data.emotion, data.priority, data.speech_required);
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (closedRef.current) return;
        useAuraStore.getState().setConnection("offline");
        scheduleRetry();
      };

      socket.onerror = () => {
        useAuraStore.getState().setConnection("offline");
      };
    };

    const scheduleRetry = () => {
      if (closedRef.current) return;
      retryRef.current = Math.min(retryRef.current + 1, 6);
      const delay = Math.min(1000 * 2 ** retryRef.current, 20000);
      timerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      stopSpeaking();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [sessionId]);

  const sendMessage = useCallback((text: string) => {
    const socket = socketRef.current;
    const store = useAuraStore.getState();
    const trimmed = text.trim();
    if (!trimmed) return;

    store.addMessage({ role: "user", content: trimmed, emotion: "neutral" });
    stopSpeaking();
    store.setAvatarState("thinking");
    store.setCaption("");

    if (socket && socket.readyState === WebSocket.OPEN) {
      store.setError(null);
      socket.send(JSON.stringify({ type: "message", text: trimmed, context: store.context }));
      return;
    }

    // FastAPI isn't running — AURA still answers, through the built-in brain.
    const history = useAuraStore
      .getState()
      .messages.slice(-12, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    void askAura({ data: { text: trimmed, history, scene: sceneSummary() } })
      .then((reply) => {
        useAuraStore.getState().setError(null);
        perform(reply.response, reply.emotion, reply.priority);
      })
      .catch((error) => {
        console.error("[aura] fallback brain failed", error);
        const st = useAuraStore.getState();
        st.setError("AURA couldn't reach a brain just now — try again in a moment.");
        st.setAvatarState("idle");
      });
  }, []);

  const sendContext = useCallback((context: SceneContext) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "context", context }));
  }, []);

  const clearSession = useCallback(() => {
    const store = useAuraStore.getState();
    store.clearMessages();
    stopSpeaking();
    store.setAvatarState("idle");
    store.setEmotion("neutral");
    socketRef.current?.send(JSON.stringify({ type: "clear" }));
  }, []);

  return { sendMessage, sendContext, clearSession };
}
