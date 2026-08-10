import { easeInOutCubic, easeOutBack, easeOutCubic } from "./math";

/**
 * Gesture library. Every gesture is authored as four phases —
 * anticipation -> main -> follow-through -> return — so a hand never
 * snaps into position. Gestures output additive arm channels that blend
 * on top of breathing, speech motion and idle sway.
 */

export type GestureName =
  | "idle"
  | "wave"
  | "point"
  | "explain"
  | "openHands"
  | "handsUp"
  | "shrug"
  | "handToChest"
  | "thinking"
  | "greeting"
  | "goodbye"
  | "excited"
  | "beat"; // small conversational punctuation

export interface ArmChannels {
  /** Degrees, negative lifts the arm forward/up. */
  rightArm: number;
  leftArm: number;
  /** Extra elbow bend, degrees. */
  rightElbow: number;
  leftElbow: number;
  /** Hand rotation, degrees. */
  rightWrist: number;
  leftWrist: number;
  /** 0 fist .. 1 open palm. */
  rightOpen: number;
  leftOpen: number;
  /** Shoulder lift 0..1 and torso response. */
  shoulder: number;
  lean: number;
  headTilt: number;
}

export const ZERO_ARMS: ArmChannels = {
  rightArm: 0, leftArm: 0,
  rightElbow: 0, leftElbow: 0,
  rightWrist: 0, leftWrist: 0,
  rightOpen: 0.35, leftOpen: 0.35,
  shoulder: 0, lean: 0, headTilt: 0,
};

interface GestureDef {
  /** Total seconds. */
  duration: number;
  /** Fractions of duration: anticipation, main, follow-through, return. */
  phases: [number, number, number, number];
  /** Peak pose reached at the end of the "main" phase. */
  peak: Partial<ArmChannels>;
  /** Optional overshoot pose used during follow-through. */
  follow?: Partial<ArmChannels>;
  /** Small backwards pose during anticipation. */
  anticipate?: Partial<ArmChannels>;
  /** Repeating oscillation applied to these channels during main+follow. */
  oscillate?: { channel: keyof ArmChannels; amount: number; hz: number };
}

export const GESTURES: Record<GestureName, GestureDef> = {
  idle: { duration: 0.6, phases: [0.2, 0.3, 0.2, 0.3], peak: {} },

  beat: {
    duration: 0.7,
    phases: [0.18, 0.3, 0.22, 0.3],
    anticipate: { rightArm: 3 },
    peak: { rightArm: -14, rightElbow: -10, rightWrist: -8, rightOpen: 0.6, shoulder: 0.12 },
    follow: { rightArm: -8, rightWrist: 4 },
  },
  explain: {
    duration: 2.2,
    phases: [0.12, 0.28, 0.35, 0.25],
    anticipate: { rightArm: 4, leftArm: -3 },
    peak: {
      rightArm: -30, leftArm: 22, rightElbow: -18, leftElbow: 14,
      rightWrist: -14, leftWrist: 12, rightOpen: 0.9, leftOpen: 0.8,
      shoulder: 0.2, lean: 0.2,
    },
    oscillate: { channel: "rightArm", amount: 7, hz: 1.1 },
  },
  openHands: {
    duration: 1.8,
    phases: [0.15, 0.3, 0.3, 0.25],
    anticipate: { rightArm: 4, leftArm: -4 },
    peak: {
      rightArm: -24, leftArm: 24, rightElbow: -14, leftElbow: 14,
      rightWrist: -22, leftWrist: 22, rightOpen: 1, leftOpen: 1, lean: 0.25, shoulder: 0.15,
    },
  },
  wave: {
    duration: 2.1,
    phases: [0.12, 0.2, 0.5, 0.18],
    anticipate: { rightArm: 5 },
    peak: { rightArm: -62, rightElbow: -30, rightWrist: -12, rightOpen: 1, shoulder: 0.35, headTilt: 4 },
    oscillate: { channel: "rightWrist", amount: 24, hz: 2.6 },
  },
  greeting: {
    duration: 1.9,
    phases: [0.14, 0.24, 0.4, 0.22],
    anticipate: { rightArm: 4 },
    peak: { rightArm: -48, rightElbow: -22, rightOpen: 1, shoulder: 0.3, lean: 0.3, headTilt: 3 },
    oscillate: { channel: "rightWrist", amount: 16, hz: 2.1 },
  },
  goodbye: {
    duration: 2.4,
    phases: [0.12, 0.22, 0.48, 0.18],
    anticipate: { rightArm: 4 },
    peak: { rightArm: -55, rightElbow: -26, rightOpen: 1, shoulder: 0.28, headTilt: -4, lean: -0.1 },
    oscillate: { channel: "rightWrist", amount: 20, hz: 1.8 },
  },
  point: {
    duration: 1.4,
    phases: [0.18, 0.22, 0.35, 0.25],
    anticipate: { rightArm: 6, rightOpen: 0.2 },
    peak: { rightArm: -38, rightElbow: -8, rightWrist: -6, rightOpen: 0.08, lean: 0.35, shoulder: 0.2 },
    follow: { rightArm: -33 },
  },
  handsUp: {
    duration: 1.6,
    phases: [0.14, 0.24, 0.32, 0.3],
    anticipate: { rightArm: 5, leftArm: -5 },
    peak: {
      rightArm: -78, leftArm: 78, rightElbow: -34, leftElbow: 34,
      rightOpen: 1, leftOpen: 1, shoulder: 0.6, lean: -0.2,
    },
  },
  shrug: {
    duration: 1.7,
    phases: [0.16, 0.24, 0.34, 0.26],
    anticipate: { shoulder: -0.1 },
    peak: {
      rightArm: -18, leftArm: 18, rightElbow: -26, leftElbow: 26,
      rightWrist: -30, leftWrist: 30, rightOpen: 1, leftOpen: 1,
      shoulder: 0.85, headTilt: 5, lean: -0.15,
    },
  },
  handToChest: {
    duration: 2,
    phases: [0.15, 0.3, 0.3, 0.25],
    anticipate: { rightArm: 3 },
    peak: { rightArm: -44, rightElbow: -46, rightWrist: -30, rightOpen: 0.7, lean: -0.1, headTilt: -3 },
  },
  thinking: {
    duration: 2.8,
    phases: [0.16, 0.24, 0.42, 0.18],
    anticipate: { rightArm: 3 },
    peak: { rightArm: -52, rightElbow: -58, rightWrist: -40, rightOpen: 0.25, headTilt: 7, lean: -0.05 },
    oscillate: { channel: "rightWrist", amount: 4, hz: 0.7 },
  },
  excited: {
    duration: 1.5,
    phases: [0.1, 0.2, 0.42, 0.28],
    anticipate: { rightArm: 6, leftArm: -6 },
    peak: {
      rightArm: -58, leftArm: 58, rightElbow: -34, leftElbow: 34,
      rightOpen: 1, leftOpen: 1, shoulder: 0.7, lean: 0.5,
    },
    oscillate: { channel: "shoulder", amount: 0.22, hz: 3.2 },
  },
};

const mix = (base: Partial<ArmChannels>, t: number): ArmChannels => {
  const out = { ...ZERO_ARMS };
  (Object.keys(base) as (keyof ArmChannels)[]).forEach((key) => {
    const v = base[key];
    if (v === undefined) return;
    out[key] = ZERO_ARMS[key] + (v - ZERO_ARMS[key]) * t;
  });
  return out;
};

const between = (a: ArmChannels, b: ArmChannels, t: number): ArmChannels => {
  const out = { ...ZERO_ARMS };
  (Object.keys(ZERO_ARMS) as (keyof ArmChannels)[]).forEach((key) => {
    out[key] = a[key] + (b[key] - a[key]) * t;
  });
  return out;
};

/** Live gesture playback with anticipation / main / follow-through / return. */
export class GesturePlayer {
  private name: GestureName = "idle";
  private time = 0;
  private playing = false;
  private amount = 1;

  get active(): boolean {
    return this.playing;
  }

  get current(): GestureName {
    return this.name;
  }

  play(name: GestureName, amount = 1) {
    if (name === "idle") { this.playing = false; return; }
    this.name = name;
    this.time = 0;
    this.amount = amount;
    this.playing = true;
  }

  cancel() {
    this.playing = false;
  }

  update(dt: number): ArmChannels {
    if (!this.playing) return ZERO_ARMS;
    const def = GESTURES[this.name];
    this.time += dt;
    const p = this.time / def.duration;
    if (p >= 1) {
      this.playing = false;
      return ZERO_ARMS;
    }

    const [a, m, f, r] = def.phases;
    const peak = mix(def.peak, this.amount);
    const anticipate = mix(def.anticipate ?? {}, this.amount);
    const follow = def.follow ? mix(def.follow, this.amount) : between(peak, ZERO_ARMS, 0.18);

    let pose: ArmChannels;
    if (p < a) {
      pose = between(ZERO_ARMS, anticipate, easeInOutCubic(p / a));
    } else if (p < a + m) {
      pose = between(anticipate, peak, easeOutBack((p - a) / m));
    } else if (p < a + m + f) {
      const t = (p - a - m) / f;
      pose = between(peak, follow, easeInOutCubic(t));
    } else {
      const t = (p - a - m - f) / r;
      pose = between(follow, ZERO_ARMS, easeOutCubic(t));
    }

    if (def.oscillate && p > a && p < a + m + f) {
      const osc = Math.sin(this.time * def.oscillate.hz * Math.PI * 2);
      const key = def.oscillate.channel;
      pose = { ...pose, [key]: pose[key] + osc * def.oscillate.amount * this.amount };
    }
    return pose;
  }
}