import { useEffect } from "react";

import { rig } from "./rig/rig";
import type { GestureName } from "./rig/gestures";
import { useAuraStore } from "./store";
import { speak, stopSpeaking } from "./voice";
import type { AvatarState, Emotion } from "./types";

/**
 * Demo mode: press D to auto-cycle the full performance, or use the number
 * keys to drive emotions and gestures by hand.
 */
interface Step {
  label: string;
  state?: AvatarState;
  emotion?: Emotion;
  intensity?: number;
  gesture?: GestureName;
  line?: string;
  hold: number;
}

const CYCLE: Step[] = [
  { label: "Idle", state: "idle", emotion: "neutral", hold: 3200 },
  { label: "Listening", state: "listening", emotion: "curious", hold: 3400 },
  { label: "Thinking", state: "thinking", emotion: "thinking", gesture: "thinking", hold: 3600 },
  { label: "Speaking", state: "speaking", emotion: "neutral", line: "Okay, so here's what I'm thinking about all of this.", hold: 200 },
  { label: "Happy", emotion: "happy", intensity: 0.9, line: "That actually made me really happy!", hold: 200 },
  { label: "Excited", emotion: "excited", intensity: 1, gesture: "excited", line: "Wait, no way — that's amazing!", hold: 200 },
  { label: "Surprised", emotion: "surprised", intensity: 1, line: "Huh? You're serious?", hold: 200 },
  { label: "Confused", emotion: "confused", intensity: 0.9, gesture: "shrug", line: "Hmm, I'm not sure I follow that.", hold: 200 },
  { label: "Embarrassed", emotion: "embarrassed", intensity: 0.9, gesture: "handToChest", line: "Ah... please don't say that out loud.", hold: 200 },
  { label: "Sad", emotion: "sad", intensity: 0.85, line: "That one actually stings a little.", hold: 200 },
  { label: "Wave", emotion: "happy", gesture: "wave", line: "Hey! Over here!", hold: 200 },
  { label: "Explain", emotion: "neutral", gesture: "explain", line: "So the way this works is pretty simple, really.", hold: 200 },
  { label: "Close-up", emotion: "proud", intensity: 0.8, line: "And yeah, I'm kind of proud of that.", hold: 200 },
  { label: "Gesture", emotion: "playful", gesture: "openHands", line: "Anyway — what do you want to talk about?", hold: 200 },
  { label: "Idle", state: "idle", emotion: "neutral", hold: 2600 },
];

const KEYS: Record<string, { emotion?: Emotion; gesture?: GestureName; state?: AvatarState }> = {
  "1": { emotion: "neutral" },
  "2": { emotion: "happy" },
  "3": { emotion: "sad" },
  "4": { emotion: "surprised" },
  "5": { emotion: "confused" },
  "6": { emotion: "embarrassed" },
  "7": { emotion: "excited" },
  "8": { gesture: "wave", emotion: "happy" },
  "9": { gesture: "explain" },
  "0": { state: "idle", emotion: "neutral" },
};

export function useDemoMode() {
  useEffect(() => {
    let running = false;
    let cancelled = false;
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const store = () => useAuraStore.getState();

    const runStep = async () => {
      if (!running || cancelled) return;
      const step = CYCLE[index % CYCLE.length]!;
      index += 1;

      if (step.emotion) {
        store().setEmotion(step.emotion);
        rig.setEmotion(step.emotion, step.intensity ?? 0.9);
      }
      if (step.state) {
        store().setAvatarState(step.state);
        rig.setState(step.state);
      }
      if (step.gesture) rig.gesture(step.gesture);

      if (step.line) {
        store().setAvatarState("speaking");
        await speak(step.line, {
          emotion: step.emotion ?? store().emotion,
          intensity: step.intensity ?? 0.9,
          onCaption: (line) => store().setCaption(line),
          onWord: (i) => store().setCaptionWord(i),
        });
        store().setCaption("");
      }
      if (!running || cancelled) return;
      timer = setTimeout(runStep, step.hold);
    };

    const stop = () => {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      stopSpeaking();
      store().setCaption("");
      store().setAvatarState("idle");
    };

    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      if (el && /input|textarea/i.test(el.tagName)) return;

      if (event.key.toLowerCase() === "d") {
        if (running) { stop(); return; }
        running = true;
        index = 0;
        void runStep();
        return;
      }
      const action = KEYS[event.key];
      if (!action) return;
      if (running) stop();
      if (action.emotion) {
        store().setEmotion(action.emotion);
        rig.setEmotion(action.emotion, 0.95);
      }
      if (action.state) {
        store().setAvatarState(action.state);
        rig.setState(action.state);
      }
      if (action.gesture) rig.gesture(action.gesture, 1);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      running = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}
