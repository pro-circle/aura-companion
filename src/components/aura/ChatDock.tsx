import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { useAuraStore } from "@/lib/aura/store";
import {
  recognitionSupported,
  requestMicAccess,
  startVoiceStream,
  stopSpeaking,
  type VoiceStream,
} from "@/lib/aura/speech";

interface ChatDockProps {
  onSend: (text: string) => void;
  onClear: () => void;
}

export function ChatDock({ onSend, onClear }: ChatDockProps) {
  const messages = useAuraStore((s) => s.messages);
  const avatarState = useAuraStore((s) => s.avatarState);
  const connection = useAuraStore((s) => s.connection);
  const micEnabled = useAuraStore((s) => s.privacy.microphone);
  const patchContext = useAuraStore((s) => s.patchContext);
  const setAvatarState = useAuraStore((s) => s.setAvatarState);
  const setError = useAuraStore((s) => s.setError);

  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const streamRef = useRef<VoiceStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = avatarState === "thinking";

  const visible = useMemo(
    () => (expanded ? messages : messages.slice(-2)),
    [messages, expanded],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, expanded, avatarState]);

  useEffect(() => () => streamRef.current?.stop(), []);

  const stopListening = () => {
    streamRef.current?.stop();
    streamRef.current = null;
    setListening(false);
    setInterim("");
    patchContext({ mic_state: "idle" });
    if (useAuraStore.getState().avatarState === "listening") setAvatarState("idle");
  };

  const startListening = async () => {
    if (micBusy) return;
    setMicBusy(true);
    stopSpeaking();

    // Grant first, listen second — otherwise the recogniser dies silently.
    const access = await requestMicAccess();
    if (!access.ok) {
      setError(access.reason ?? "Couldn't open the microphone.");
      setMicBusy(false);
      return;
    }
    if (!recognitionSupported()) {
      setError("Live voice input needs Chrome, Edge or Safari.");
      setMicBusy(false);
      return;
    }

    const stream = startVoiceStream({
      onInterim: (text) => setInterim(text),
      onFinal: (text) => {
        setInterim("");
        if (text.trim()) onSend(text.trim());
      },
      onError: (message) => {
        setError(message);
        stopListening();
      },
      onEnd: () => {
        setListening(false);
        setInterim("");
        patchContext({ mic_state: "idle" });
      },
    });
    setMicBusy(false);
    if (!stream) return;
    streamRef.current = stream;
    setListening(true);
    setError(null);
    setAvatarState("listening");
    patchContext({ mic_state: "listening" });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-4 md:px-6">
      <section
        className="aura-dock pointer-events-auto w-full max-w-3xl rounded-3xl px-3 pb-3 pt-2"
        aria-label="Conversation"
      >
        {/* handle */}
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="group flex items-center gap-2 rounded-full px-2 py-1 text-[11px] text-[color:var(--sky-sub-ink)] transition-colors hover:text-[color:var(--sky-ink)]"
            aria-expanded={expanded}
          >
            <span className="h-1 w-8 rounded-full bg-[color:var(--sky-sub-ink)]/40 transition-all group-hover:w-10" />
            {expanded ? "Collapse chat" : "Show full chat"}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                stopListening();
                onClear();
                setExpanded(false);
              }}
              className="rounded-full px-2 py-1 text-[11px] text-[color:var(--sky-sub-ink)] transition-colors hover:text-[color:var(--sky-ink)]"
            >
              Clear
            </button>
          )}
        </div>

        <div
          ref={scrollRef}
          className={`aura-scroll aura-fade-top space-y-2 overflow-y-auto px-2 transition-[max-height] duration-500 ease-out ${
            expanded ? "max-h-[46vh] py-2" : "max-h-[9.5rem] py-1"
          }`}
        >
          {messages.length === 0 && (
            <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-[color:var(--sky-sub-ink)]">
              <span>Say something —</span>
              {["hey, what's up?", "roast my desk setup", "tell me something dumb"].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSend(prompt)}
                  className="rounded-full border border-[color:var(--sky-sub-ink)]/25 px-3 py-1 transition-colors hover:border-[color:var(--sky-ink)]/50 hover:text-[color:var(--sky-ink)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {visible.map((message, index) => {
            const depth = visible.length - 1 - index;
            const opacity = expanded ? 1 : depth === 0 ? 1 : 0.5;
            return (
              <div
                key={message.id}
                style={{ opacity }}
                className={`flex transition-opacity duration-500 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[80%] rounded-2xl rounded-br-md bg-[color:var(--sky-ink)]/85 px-3.5 py-2 text-sm text-[color:rgb(var(--sky-panel))]"
                      : "max-w-[86%] rounded-2xl rounded-bl-md bg-[color:rgb(var(--sky-panel))]/70 px-3.5 py-2 text-sm text-[color:var(--sky-ink)]"
                  }
                >
                  <div className="prose prose-sm max-w-none [&_*]:!text-inherit [&_p]:my-0.5">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}

          {(busy || interim) && (
            <div className="flex items-center gap-2 px-1 text-xs text-[color:var(--sky-sub-ink)]">
              <span className="h-1.5 w-1.5 animate-aura-pulse rounded-full bg-[color:var(--sky-ink)]" />
              {interim ? `“${interim}”` : "thinking…"}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="mt-1 flex items-center gap-2">
          {hydrated && micEnabled && (
            <button
              type="button"
              onClick={() => (listening ? stopListening() : void startListening())}
              disabled={micBusy}
              title={listening ? "Stop listening" : "Talk to AURA"}
              aria-label={listening ? "Stop voice streaming" : "Start voice streaming"}
              className={
                listening
                  ? "aura-mic-live flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--sky-ink)] text-[color:rgb(var(--sky-panel))]"
                  : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[color:var(--sky-sub-ink)]/30 text-[color:var(--sky-sub-ink)] transition-colors hover:text-[color:var(--sky-ink)] disabled:opacity-40"
              }
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden="true">
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
              </svg>
            </button>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            autoComplete="off"
            enterKeyHint="send"
            placeholder={
              listening
                ? interim || "Listening… just talk"
                : connection === "connected"
                  ? "Talk to AURA…"
                  : "Type to AURA…"
            }
            className="h-11 flex-1 rounded-full border border-[color:var(--sky-sub-ink)]/25 bg-[color:rgb(var(--sky-panel))]/70 px-4 text-sm text-[color:var(--sky-ink)] outline-none transition-colors placeholder:text-[color:var(--sky-sub-ink)] focus:border-[color:var(--sky-ink)]/50"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="h-11 rounded-full bg-[color:var(--sky-ink)] px-5 text-sm font-medium text-[color:rgb(var(--sky-panel))] transition-opacity disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
