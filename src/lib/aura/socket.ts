import { useCallback, useEffect, useRef } from "react";

import { useAuraStore } from "./store";
import { speak, stopSpeaking } from "./speech";
import { backendWsUrl, type SceneContext, type ServerEvent } from "./types";

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
          s.setEmotion(data.emotion);
          s.addMessage({ role: "assistant", content: data.response, emotion: data.emotion });

          if (data.speech_required && s.privacy.voice) {
            s.setAvatarState("speaking");
            speak(data.response, {
              emotion: data.emotion,
              onCaption: (line) => useAuraStore.getState().setCaption(line),
              onWord: (index) => useAuraStore.getState().setCaptionWord(index),
              onEnd: () => {
                const st = useAuraStore.getState();
                st.setCaption("");
                st.setAvatarState("idle");
              },
            });
          } else {
            s.setCaption("");
            s.setAvatarState("idle");
          }
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

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      store.setError("AURA's backend is offline — start the FastAPI server to talk.");
      return;
    }
    stopSpeaking();
    store.setAvatarState("thinking");
    store.setCaption("");
    socket.send(
      JSON.stringify({ type: "message", text: trimmed, context: store.context }),
    );
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
