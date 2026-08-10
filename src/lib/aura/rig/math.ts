/** Small math toolkit shared by every animation system (frame-rate safe). */

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Exponential smoothing that is independent of frame rate. */
export function damp(current: number, target: number, dt: number, rate = 8): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const chance = (p: number) => Math.random() < p;

/**
 * Critically-tunable spring-damper. Used for secondary motion (hair, hands,
 * head follow-through) so movement overshoots and settles like real mass.
 */
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(
    initial = 0,
    /** Higher = snappier. */
    public stiffness = 120,
    /** 1 = critically damped, <1 overshoots. */
    public damping = 0.7,
  ) {
    this.value = initial;
    this.target = initial;
  }

  set(target: number) {
    this.target = target;
  }

  /** Semi-implicit Euler, sub-stepped so big dt can't explode the spring. */
  update(dt: number): number {
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    const c = 2 * this.damping * Math.sqrt(this.stiffness);
    for (let i = 0; i < steps; i += 1) {
      const accel = (this.target - this.value) * this.stiffness - this.velocity * c;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

/** Cheap value noise — smooth, non-repeating drift for idle motion. */
export class Noise1D {
  private readonly seeds: number[];

  constructor(octaves = 4, seed = Math.random() * 1000) {
    this.seeds = Array.from({ length: octaves }, (_, i) => seed + i * 137.13);
  }

  at(t: number): number {
    let sum = 0;
    let amp = 1;
    let total = 0;
    for (let i = 0; i < this.seeds.length; i += 1) {
      const f = 0.13 * Math.pow(1.87, i);
      const s = this.seeds[i] ?? 0;
      sum += Math.sin(t * f * 6.283 + s) * amp;
      total += amp;
      amp *= 0.55;
    }
    return sum / (total || 1);
  }
}