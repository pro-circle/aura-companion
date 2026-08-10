import { useEffect, type RefObject } from "react";

import { rig } from "./rig/rig";
import { Noise1D, damp, rand } from "./rig/math";
import { useAuraStore } from "./store";

export type ShotName =
  | "WIDE"
  | "NORMAL"
  | "MEDIUM"
  | "CLOSEUP"
  | "EMOTIONAL_CLOSEUP"
  | "GESTURE_VIEW";

interface Shot {
  scale: number;
  x: number;
  y: number;
  /** How fast the camera eases toward this framing. */
  rate: number;
}

const SHOTS: Record<ShotName, Shot> = {
  WIDE: { scale: 1.0, x: 0, y: 0, rate: 0.7 },
  NORMAL: { scale: 1.1, x: 0, y: -1, rate: 0.9 },
  MEDIUM: { scale: 1.18, x: 0, y: -2, rate: 1.1 },
  CLOSEUP: { scale: 1.34, x: 0, y: -3.5, rate: 1.3 },
  EMOTIONAL_CLOSEUP: { scale: 1.52, x: 0, y: -5, rate: 2.4 },
  GESTURE_VIEW: { scale: 1.08, x: 0, y: -0.5, rate: 1.6 },
};

const BIG_EMOTION = new Set(["surprised", "excited", "angry", "sad", "embarrassed"]);

/**
 * Cinematic camera controller. Picks a framing from the live scenario and
 * eases toward it every frame, with a permanent handheld drift so the shot
 * never feels locked off.
 */
export function useCameraRig(target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const drift = new Noise1D(3, 21.7);
    const driftY = new Noise1D(3, 77.3);
    let frame = 0;
    let last = performance.now();
    let t = 0;
    const cur = { scale: 1, x: 0, y: 0 };
    let shake = 0;
    let lastEmotion = useAuraStore.getState().emotion;

    const unsub = useAuraStore.subscribe((state) => {
      if (state.emotion !== lastEmotion) {
        lastEmotion = state.emotion;
        // Quick (but smooth) punch-in on a strong emotional turn.
        if (BIG_EMOTION.has(lastEmotion)) shake = 1;
      }
    });

    const pick = (): ShotName => {
      const s = useAuraStore.getState();
      const gesturing = Math.abs(rig.pose.arms.rightArm) + Math.abs(rig.pose.arms.leftArm) > 26;
      if (gesturing) return "GESTURE_VIEW";
      if (s.avatarState === "speaking") {
        return BIG_EMOTION.has(s.emotion) && shake > 0.2 ? "EMOTIONAL_CLOSEUP" : "CLOSEUP";
      }
      if (s.avatarState === "listening") return "MEDIUM";
      if (s.avatarState === "thinking") return "NORMAL";
      return s.context.face_present || s.context.people > 0 ? "MEDIUM" : "WIDE";
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      shake = damp(shake, 0, dt, 1.1);

      const shot = SHOTS[pick()];
      const rate = shot.rate * (1 + shake * 1.6);
      // Handheld life: slow noise + breathing-coupled bob.
      const wobbleX = drift.at(t * 0.12) * 1.1 + rig.pose.bodySway * 0.06;
      const wobbleY = driftY.at(t * 0.1) * 0.9 + rig.pose.breath * 0.05;
      const punch = shake * 0.06;

      cur.scale = damp(cur.scale, shot.scale + punch, dt, rate);
      cur.x = damp(cur.x, shot.x + wobbleX, dt, rate);
      cur.y = damp(cur.y, shot.y + wobbleY, dt, rate);

      const el = target.current;
      if (el) {
        el.style.transform =
          `translate3d(${cur.x.toFixed(3)}%, calc(4vh + ${cur.y.toFixed(3)}%), 0) scale(${cur.scale.toFixed(4)})`;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      unsub();
    };
  }, [target]);
}

/** Occasional whip of energy the demo mode can trigger. */
export function cameraJolt() {
  rig.gesture("beat", rand(0.5, 0.9));
}
