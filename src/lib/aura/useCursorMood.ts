import { useEffect, useRef } from "react";

import { useAuraStore } from "./store";
import { speak, stopSpeaking } from "./speech";
import type { Emotion } from "./types";

/**
 * Cursor-mood engine.
 *
 * Watches the pointer the way a friend watches your hand: scribbling,
 * shaking, sprinting across the screen, circling, going dead still or
 * wandering off. When a gesture is recognised AURA reacts on her own —
 * locally, so it works even when the backend is asleep.
 */

type Gesture = "scribble" | "shake" | "dash" | "circle" | "idle" | "left" | "returned";

const LINES: Record<Gesture, { text: string[]; emotion: Emotion }> = {
  scribble: {
    emotion: "happy",
    text: [
      "Hey — why are you scribbling all over the screen? You know I can see that, right?",
      "Are you drawing me? Because that looks more like spaghetti.",
      "Okay, artist mode activated. Your masterpiece is… a scribble.",
    ],
  },
  shake: {
    emotion: "surprised",
    text: [
      "Whoa, stop shaking the poor mouse! What did it ever do to you?",
      "Easy there, caffeine champion. The cursor is dizzy.",
    ],
  },
  dash: {
    emotion: "surprised",
    text: [
      "Where are you running off to so fast?",
      "Speedrun! Any percent! I can barely keep my eyes on you.",
    ],
  },
  circle: {
    emotion: "happy",
    text: [
      "Circles, huh? Are you hypnotising me? Because it's kind of working.",
      "Round and round… you're making me seasick, you know.",
    ],
  },
  idle: {
    emotion: "confused",
    text: [
      "Hello? Did you fall asleep on me?",
      "You've been frozen for a while. Blink twice if you need help.",
    ],
  },
  left: {
    emotion: "sad",
    text: ["Hey, where'd you go? I was in the middle of being charming.", "Rude. You just left."],
  },
  returned: {
    emotion: "happy",
    text: ["Oh, you're back! I totally wasn't waiting.", "There you are. Missed you, obviously."],
  },
};

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)]!;
}

export function useCursorMood(enabled = true) {
  const spokeAt = useRef(0);
  const lastGesture = useRef<Gesture | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let raf = 0;
    let last = { x: 0, y: 0, t: performance.now() };
    let lastActivity = performance.now();
    let hadPointer = false;
    let away = false;

    // rolling signals
    const reversals: number[] = []; // timestamps of direction flips
    let angleSum = 0;
    let angleAt = performance.now();
    let prevAngle: number | null = null;
    let prevDirX = 0;
    let peakSpeed = 0;

    const react = (gesture: Gesture) => {
      const now = performance.now();
      const store = useAuraStore.getState();
      if (now - spokeAt.current < 14000) return;
      if (lastGesture.current === gesture && now - spokeAt.current < 45000) return;
      if (store.avatarState === "speaking" || store.avatarState === "thinking") return;

      spokeAt.current = now;
      lastGesture.current = gesture;

      const { text, emotion } = LINES[gesture];
      const line = pick(text);

      store.setEmotion(emotion);
      store.addMessage({ role: "assistant", content: line, emotion });

      if (store.privacy.voice) {
        store.setAvatarState("speaking");
        stopSpeaking();
        speak(line, {
          emotion,
          onEnd: () => {
            const s = useAuraStore.getState();
            if (s.avatarState === "speaking") s.setAvatarState("idle");
          },
        });
      }
    };

    const onMove = (event: PointerEvent) => {
      const now = performance.now();
      const dt = Math.max(8, now - last.t);
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      const dist = Math.hypot(dx, dy);
      const speed = dist / dt; // px per ms

      if (hadPointer) {
        if (away) {
          away = false;
          react("returned");
        }

        // direction flips along X -> scribbling / shaking
        const dirX = Math.sign(dx);
        if (dirX !== 0 && prevDirX !== 0 && dirX !== prevDirX && dist > 4) {
          reversals.push(now);
        }
        if (dirX !== 0) prevDirX = dirX;
        while (reversals.length && now - reversals[0]! > 1200) reversals.shift();

        // accumulated turning -> circling
        if (dist > 3) {
          const angle = Math.atan2(dy, dx);
          if (prevAngle !== null) {
            let delta = angle - prevAngle;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            angleSum += delta;
          }
          prevAngle = angle;
        }
        if (now - angleAt > 2200) {
          angleAt = now;
          angleSum = 0;
        }

        peakSpeed = Math.max(peakSpeed * 0.98, speed);

        if (reversals.length >= 8) {
          reversals.length = 0;
          react(peakSpeed > 2.2 ? "shake" : "scribble");
        } else if (Math.abs(angleSum) > Math.PI * 4) {
          angleSum = 0;
          react("circle");
        } else if (speed > 4.5 && dist > 260) {
          react("dash");
        }
      }

      hadPointer = true;
      last = { x: event.clientX, y: event.clientY, t: now };
      lastActivity = now;
    };

    const onLeave = () => {
      if (!hadPointer) return;
      away = true;
      window.setTimeout(() => {
        if (away) react("left");
      }, 6000);
    };

    const loop = () => {
      const now = performance.now();
      if (hadPointer && !away && now - lastActivity > 45000) {
        lastActivity = now;
        react("idle");
      }
      raf = window.setTimeout(loop, 2000) as unknown as number;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    loop();

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      clearTimeout(raf);
    };
  }, [enabled]);
}
