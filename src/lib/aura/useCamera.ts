import { useAuraStore } from "./store";

export interface CameraShot {
  scale: number;
  x: number;
  y: number;
  /** Seconds — slow pushes feel cinematic, reactions snap faster. */
  duration: number;
  label: string;
}

/**
 * Virtual camera: picks a shot from the live scenario (what AURA is doing,
 * how she feels, whether someone is in frame) and eases between them.
 */
export function useCamera(): CameraShot {
  const avatarState = useAuraStore((s) => s.avatarState);
  const emotion = useAuraStore((s) => s.emotion);
  const facePresent = useAuraStore((s) => s.context.face_present);
  const people = useAuraStore((s) => s.context.people);

  // Wide establishing shot when nothing is happening.
  let shot: CameraShot = { scale: 1, x: 0, y: 0, duration: 4.5, label: "wide" };

  if (avatarState === "listening") {
    shot = { scale: 1.12, x: 0, y: -1.5, duration: 3.2, label: "medium" };
  }
  if (avatarState === "thinking") {
    shot = { scale: 1.06, x: 2.5, y: -1, duration: 3.8, label: "drift" };
  }
  if (avatarState === "speaking") {
    shot = { scale: 1.28, x: 0, y: -3, duration: 2.6, label: "close-up" };
    if (emotion === "surprised") shot = { scale: 1.5, x: 0, y: -4.5, duration: 0.9, label: "punch-in" };
    if (emotion === "happy") shot = { scale: 1.34, x: -1, y: -3.5, duration: 2, label: "warm close" };
    if (emotion === "sad") shot = { scale: 1.18, x: 1.5, y: -1.5, duration: 4.2, label: "slow pull" };
    if (emotion === "alert") shot = { scale: 1.42, x: 0, y: -3.5, duration: 1.2, label: "tight" };
  }

  // Someone in frame? Sit a touch closer and more intimate.
  if (facePresent || people > 0) {
    shot = { ...shot, scale: shot.scale + 0.06, y: shot.y - 1 };
  }

  return shot;
}