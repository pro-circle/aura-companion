/**
 * Viseme-aware lip sync.
 *
 * Web Speech gives us word boundaries but no phonemes, so we derive a viseme
 * timeline from the grapheme sequence of each word: text -> phoneme-ish
 * classes -> viseme keys -> timed events. The mouth controller then eases
 * between mouth shapes instead of pumping open/closed on volume.
 */

export type Viseme =
  | "sil"
  | "A"
  | "E"
  | "I"
  | "O"
  | "U"
  | "M" // M B P — lips closed
  | "F" // F V — lip bite
  | "S" // S Z SH CH — narrow teeth
  | "TH" // TH — tongue tip
  | "L" // L N D T — tongue up
  | "R"; // R W — rounded

export interface MouthShape {
  /** 0..1 jaw opening. */
  open: number;
  /** -0.4 pucker .. 0.6 wide. */
  wide: number;
  /** 0..1 lip rounding. */
  round: number;
  /** 0..1 upper teeth visible. */
  teeth: number;
  /** 0..1 tongue visible. */
  tongue: number;
  /** 0..1 lip press (M/B/P). */
  press: number;
}

export const MOUTH: Record<Viseme, MouthShape> = {
  sil: { open: 0.0, wide: 0, round: 0, teeth: 0, tongue: 0, press: 0.15 },
  A: { open: 1.0, wide: 0.25, round: 0.05, teeth: 0.45, tongue: 0.25, press: 0 },
  E: { open: 0.55, wide: 0.55, round: 0, teeth: 0.7, tongue: 0.15, press: 0 },
  I: { open: 0.32, wide: 0.6, round: 0, teeth: 0.8, tongue: 0.1, press: 0 },
  O: { open: 0.72, wide: -0.25, round: 0.85, teeth: 0.15, tongue: 0.1, press: 0 },
  U: { open: 0.34, wide: -0.4, round: 1, teeth: 0.05, tongue: 0.05, press: 0 },
  M: { open: 0.04, wide: 0.05, round: 0, teeth: 0, tongue: 0, press: 1 },
  F: { open: 0.18, wide: 0.3, round: 0, teeth: 0.9, tongue: 0, press: 0.5 },
  S: { open: 0.16, wide: 0.5, round: 0, teeth: 1, tongue: 0.1, press: 0.1 },
  TH: { open: 0.28, wide: 0.35, round: 0, teeth: 0.7, tongue: 0.85, press: 0 },
  L: { open: 0.38, wide: 0.25, round: 0, teeth: 0.5, tongue: 0.7, press: 0 },
  R: { open: 0.4, wide: -0.1, round: 0.6, teeth: 0.2, tongue: 0.35, press: 0 },
};

export interface VisemeEvent {
  viseme: Viseme;
  /** Seconds from the start of the word. */
  at: number;
  /** Seconds this shape is held. */
  duration: number;
  /** 0..1 articulation strength (stressed syllables open wider). */
  strength: number;
}

const VOWEL: Record<string, Viseme> = {
  a: "A", e: "E", i: "I", o: "O", u: "U", y: "I",
};

const CONSONANT: Record<string, Viseme> = {
  m: "M", b: "M", p: "M",
  f: "F", v: "F",
  s: "S", z: "S", c: "S", x: "S", j: "S", g: "S",
  t: "L", d: "L", n: "L", l: "L", k: "L", q: "L",
  r: "R", w: "R",
  h: "A",
};

/** Rough phoneme-class segmentation of an English word. */
function classify(word: string): Viseme[] {
  const letters = word.toLowerCase().replace(/[^a-z']/g, "");
  const out: Viseme[] = [];
  for (let i = 0; i < letters.length; i += 1) {
    const ch = letters[i] ?? "";
    const next = letters[i + 1] ?? "";
    const pair = ch + next;

    if (pair === "th") { out.push("TH"); i += 1; continue; }
    if (pair === "sh" || pair === "ch") { out.push("S"); i += 1; continue; }
    if (pair === "ph") { out.push("F"); i += 1; continue; }
    if (pair === "ck" || pair === "kn") { out.push("L"); i += 1; continue; }
    if (pair === "oo" || pair === "ou" || pair === "ow") { out.push("U"); i += 1; continue; }
    if (pair === "ee" || pair === "ea") { out.push("E"); i += 1; continue; }
    if (pair === "ai" || pair === "ay") { out.push("A"); i += 1; continue; }

    const v = VOWEL[ch];
    if (v) {
      // Silent trailing "e".
      if (ch === "e" && i === letters.length - 1 && letters.length > 2) continue;
      if (out[out.length - 1] === v) continue; // don't double the same vowel
      out.push(v);
      continue;
    }
    const c = CONSONANT[ch];
    if (c) {
      if (out[out.length - 1] === c && c !== "M") continue;
      out.push(c);
    }
  }
  return out.length ? out : ["A"];
}

const isVowel = (v: Viseme) => v === "A" || v === "E" || v === "I" || v === "O" || v === "U";

/**
 * Build a viseme timeline for a word. `duration` is the estimated spoken
 * length in seconds; vowels get most of the time, plosives are quick.
 */
export function visemesForWord(word: string, duration: number, stress = 0.7): VisemeEvent[] {
  const seq = classify(word);
  const weights = seq.map((v) => (isVowel(v) ? 1.6 : v === "M" ? 0.6 : 0.85));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let at = 0;
  return seq.map((viseme, index) => {
    const share = ((weights[index] ?? 1) / total) * duration;
    const event: VisemeEvent = {
      viseme,
      at,
      duration: share,
      // First syllable of a word is articulated a touch harder.
      strength: Math.min(1, stress * (index === 0 ? 1.1 : 0.92) + (isVowel(viseme) ? 0.12 : 0)),
    };
    at += share;
    return event;
  });
}

/** Estimated spoken duration of a word in seconds, at a given rate. */
export function estimateWordDuration(word: string, rate = 1): number {
  const letters = word.replace(/[^A-Za-z']/g, "").length || 1;
  const syllables = Math.max(1, (word.toLowerCase().match(/[aeiouy]+/g) ?? []).length);
  const base = 0.09 * letters * 0.55 + syllables * 0.16;
  return Math.max(0.12, base / Math.max(0.4, rate));
}

/** Interpolate between two mouth shapes. */
export function blendMouth(a: MouthShape, b: MouthShape, t: number): MouthShape {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    open: m(a.open, b.open),
    wide: m(a.wide, b.wide),
    round: m(a.round, b.round),
    teeth: m(a.teeth, b.teeth),
    tongue: m(a.tongue, b.tongue),
    press: m(a.press, b.press),
  };
}