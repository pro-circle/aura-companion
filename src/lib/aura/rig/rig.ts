import type { AvatarState, Emotion } from "../types";
import { EMOTION_POSE, scalePose, type EmotionPose } from "./emotions";
import { GesturePlayer, ZERO_ARMS, type ArmChannels, type GestureName } from "./gestures";
import { Noise1D, Spring, chance, clamp, damp, lerp, rand, smoothstep } from "./math";
import { MOUTH, blendMouth, visemesForWord, type MouthShape, type VisemeEvent } from "./visemes";

/**
 * AvatarRig — the real-time animation engine.
 *
 * It owns every animated channel (head, eyes, lids, brows, mouth, torso,
 * arms, hair) and blends idle life + emotion + speech + gestures + secondary
 * physics into one pose each frame. It is deliberately React-free: the
 * component just reads `rig.pose` inside its rAF loop and writes attributes.
 */

export interface RigPose {
  headTurn: number; // deg-ish, +right
  headTilt: number; // deg, +right ear down
  headNod: number; // px, + down
  headPush: number; // -1 back .. 1 forward
  breath: number; // px
  bodySway: number; // px
  shoulder: number; // px lift
  lean: number; // -1 .. 1

  eyeOpenL: number;
  eyeOpenR: number;
  gazeX: number;
  gazeY: number;
  pupil: number;
  squint: number;

  browL: number; // angle bias
  browR: number;
  browY: number;
  browInner: number;

  mouth: MouthShape;
  smile: number;
  blush: number;

  arms: ArmChannels;

  hairLag: number; // side hair swing
  hairBangs: number;
  hairBack: number;

  /** Overall motion energy 0..2 — the camera reads this. */
  energy: number;
}

const NEUTRAL_MOUTH: MouthShape = MOUTH.sil;

interface Blink {
  phase: "idle" | "close" | "hold" | "open";
  t: number;
  closeDur: number;
  holdDur: number;
  openDur: number;
  queued: number;
  value: number;
}

export class AvatarRig {
  readonly pose: RigPose = {
    headTurn: 0, headTilt: 0, headNod: 0, headPush: 0,
    breath: 0, bodySway: 0, shoulder: 0, lean: 0,
    eyeOpenL: 1, eyeOpenR: 1, gazeX: 0, gazeY: 0, pupil: 1, squint: 0,
    browL: 0, browR: 0, browY: 0, browInner: 0,
    mouth: { ...NEUTRAL_MOUTH }, smile: 0.25, blush: 0.45,
    arms: { ...ZERO_ARMS },
    hairLag: 0, hairBangs: 0, hairBack: 0,
    energy: 1,
  };

  // ---- inputs -----------------------------------------------------------
  private state: AvatarState = "idle";
  private emotion: Emotion = "neutral";
  private intensity = 0.85;
  private target: EmotionPose = scalePose(EMOTION_POSE.neutral, 0.85);
  private blended: EmotionPose = { ...this.target };
  private pointer = { x: 0, y: 0 };
  private audioLevel = 0;
  private speaking = false;

  // ---- systems ----------------------------------------------------------
  private readonly gestures = new GesturePlayer();
  private readonly nHead = new Noise1D(4);
  private readonly nTilt = new Noise1D(3, 88.2);
  private readonly nBody = new Noise1D(3, 412.7);
  private readonly nMicro = new Noise1D(2, 913.4);

  private headTurnS = new Spring(0, 90, 0.62);
  private headTiltS = new Spring(0, 80, 0.6);
  private headNodS = new Spring(0, 150, 0.55);
  private hairSideS = new Spring(0, 42, 0.32);
  private hairBangS = new Spring(0, 70, 0.4);
  private hairBackS = new Spring(0, 30, 0.28);
  private leanS = new Spring(0, 45, 0.75);

  private time = 0;

  // blink
  private blink: Blink = {
    phase: "idle", t: 0, closeDur: 0.06, holdDur: 0.02, openDur: 0.09, queued: 0, value: 0,
  };
  private nextBlinkAt = 2.5;
  private blinkAsym = 0;

  // gaze
  private gazeTarget = { x: 0, y: 0 };
  private gazeCur = { x: 0, y: 0 };
  private saccade = { x: 0, y: 0 };
  private nextGazeAt = 1.6;
  private nextSaccadeAt = 0.4;
  private gazeAsym = 0;

  // micro-expressions
  private micro = { brow: 0, smile: 0, squint: 0, tilt: 0, widen: 0 };
  private microTarget = { brow: 0, smile: 0, squint: 0, tilt: 0, widen: 0 };
  private nextMicroAt = 3;

  // conversational beats (nods, head shakes, look-aways while talking)
  private beat = { nod: 0, turn: 0, push: 0 };
  private nextBeatAt = 2.4;
  private nextGestureAt = 4;

  // lip sync
  private visemeQueue: (VisemeEvent & { start: number })[] = [];
  private mouthCur: MouthShape = { ...NEUTRAL_MOUTH };
  private mouthTarget: MouthShape = { ...NEUTRAL_MOUTH };
  private articulation = 0;

  /* ------------------------------------------------------------ controls */

  setState(state: AvatarState) {
    if (state === this.state) return;
    this.state = state;
    if (state === "thinking") {
      this.gazeTarget = { x: rand(-0.7, -0.3) * (chance(0.5) ? 1 : -1), y: -0.45 };
      this.nextGazeAt = this.time + rand(1.2, 2.4);
      if (chance(0.55)) this.gestures.play("thinking", 0.85);
    }
    if (state === "listening") {
      this.gazeTarget = { x: 0, y: 0 };
      this.nextBeatAt = this.time + rand(0.8, 1.6);
    }
    if (state === "speaking") {
      this.gazeTarget = { x: 0, y: 0 };
      this.nextGestureAt = this.time + rand(0.4, 1.2);
    }
    if (state === "idle") {
      this.speaking = false;
      this.visemeQueue = [];
    }
  }

  /** Unified emotion controller — drives face, body AND (via voice) prosody. */
  setEmotion(emotion: Emotion, intensity = 0.85) {
    this.emotion = emotion;
    this.intensity = clamp(intensity, 0, 1);
    this.target = scalePose(EMOTION_POSE[emotion] ?? EMOTION_POSE.neutral, this.intensity);

    // Emotional reaction beats.
    if (emotion === "surprised") {
      this.beat.push = -1;
      this.blink.queued = 0;
      this.nextBlinkAt = this.time + 0.5;
    }
    if (emotion === "excited" || emotion === "happy") this.beat.nod = 1.2;
    if (emotion === "confused") this.beat.turn = rand(-4, 4);
  }

  get currentEmotion(): Emotion {
    return this.emotion;
  }

  get currentIntensity(): number {
    return this.intensity;
  }

  gesture(name: GestureName, amount = 1) {
    this.gestures.play(name, amount);
  }

  setPointer(x: number, y: number) {
    this.pointer.x = clamp(x, -1, 1);
    this.pointer.y = clamp(y, -1, 1);
  }

  /** Fallback lip-sync input (0..1) when no viseme timeline is available. */
  setAudioLevel(level: number) {
    this.audioLevel = clamp(level, 0, 1);
  }

  beginSpeech() {
    this.speaking = true;
    this.state = "speaking";
  }

  endSpeech() {
    this.speaking = false;
    this.visemeQueue = [];
    this.audioLevel = 0;
  }

  /**
   * Schedule the visemes for one spoken word. `delay` lets the caller push a
   * whole phrase ahead of time; `stress` marks emphasised words.
   */
  speakWord(word: string, duration: number, delay = 0, stress = 0.75) {
    const events = visemesForWord(word, duration, stress);
    const start = this.time + delay;
    events.forEach((event) => this.visemeQueue.push({ ...event, start: start + event.at }));
    // Prune anything long expired.
    if (this.visemeQueue.length > 220) {
      this.visemeQueue = this.visemeQueue.filter((e) => e.start + e.duration > this.time - 0.2);
    }
    // Stressed words earn a co-articulated brow/head accent.
    if (stress > 0.85) {
      this.micro.brow = Math.max(this.micro.brow, 0.5);
      this.beat.nod = Math.max(this.beat.nod, 0.8);
    }
  }

  /** Word-level emphasis accents used by the voice pipeline. */
  accent(kind: "question" | "exclaim" | "pause") {
    if (kind === "question") {
      this.micro.brow = 0.9;
      this.microTarget.tilt = rand(3, 7);
      this.micro.widen = 0.35;
    } else if (kind === "exclaim") {
      this.beat.nod = 1.4;
      this.micro.brow = 0.8;
      this.beat.push = 0.6;
    } else {
      this.gazeTarget = { x: rand(-0.5, 0.5), y: -0.3 };
      this.nextGazeAt = this.time + rand(0.5, 1);
    }
  }

  /* --------------------------------------------------------------- update */

  update(dt: number): RigPose {
    const d = Math.min(0.05, dt);
    this.time += d;
    const t = this.time;

    // Smoothly blend the emotional pose (never switch instantly).
    (Object.keys(this.blended) as (keyof EmotionPose)[]).forEach((key) => {
      this.blended[key] = damp(this.blended[key], this.target[key], d, 4.5);
    });
    const e = this.blended;
    const listening = this.state === "listening";
    const thinking = this.state === "thinking";
    const speaking = this.state === "speaking" || this.speaking;
    const energy = e.energy;
    const tempo = e.tempo;

    this.updateMicro(d, t, speaking);
    this.updateBeats(d, t, speaking, listening, thinking);
    this.updateBlink(d, t, e);
    this.updateGaze(d, t, e, listening, thinking, speaking);
    this.updateMouth(d, t, speaking);

    /* ---- head ---------------------------------------------------------- */
    const idleTurn = this.nHead.at(t * 0.32 * tempo) * 4.2 * energy;
    const idleTilt = this.nTilt.at(t * 0.24 * tempo) * 2.4 * energy;
    const speechTurn = speaking ? Math.sin(t * 1.7 * tempo) * 1.6 * energy : 0;

    this.headTurnS.set(
      idleTurn + speechTurn + this.pointer.x * 6 + this.gazeCur.x * 3.5 + this.beat.turn,
    );
    this.headTiltS.set(
      idleTilt + e.tilt + this.micro.tilt + this.pointer.y * 1.6 +
        (thinking ? 4 : 0) + this.gestures.update(0).headTilt,
    );
    this.headNodS.set(this.beat.nod * 3.2 + (speaking ? this.articulation * 1.6 : 0));

    const headTurn = this.headTurnS.update(d);
    const headTilt = this.headTiltS.update(d);
    const headNod = this.headNodS.update(d);

    /* ---- gestures + arms ----------------------------------------------- */
    if (speaking && t > this.nextGestureAt) {
      const pick = this.pickGesture();
      this.gestures.play(pick, rand(0.55, 1) * clamp(energy, 0.5, 1.6));
      this.nextGestureAt = t + rand(2.4, 5.5) / Math.max(0.6, tempo);
    }
    const arms = this.gestures.update(d);

    /* ---- torso --------------------------------------------------------- */
    const breathHz = (speaking ? 0.42 : 0.26) * tempo;
    const breath = Math.sin(t * breathHz * Math.PI * 2) * (1.9 * energy) +
      (speaking ? Math.sin(t * 2.9) * 0.4 : 0);
    const sway = this.nBody.at(t * 0.18 * tempo) * 3.4 * energy;

    this.leanS.set(
      e.lean + arms.lean + (listening ? 0.4 : 0) + (speaking ? 0.18 : 0) + this.beat.push * 0.5,
    );
    const lean = this.leanS.update(d);

    /* ---- hair (secondary spring physics) -------------------------------- */
    this.hairSideS.set(headTurn + sway * 0.4);
    this.hairBangS.set(headTurn * 0.7 + headNod * 0.5);
    this.hairBackS.set(headTurn * 0.9 + sway * 0.6 + arms.shoulder * 3);
    const hairSide = this.hairSideS.update(d);
    const hairBang = this.hairBangS.update(d);
    const hairBack = this.hairBackS.update(d);

    /* ---- commit --------------------------------------------------------- */
    const p = this.pose;
    p.headTurn = headTurn;
    p.headTilt = headTilt;
    p.headNod = headNod;
    p.headPush = damp(p.headPush, this.beat.push, d, 6);
    p.breath = breath;
    p.bodySway = sway;
    p.shoulder = damp(
      p.shoulder,
      (e.shoulder + arms.shoulder + (speaking ? 0.1 : 0)) * 7,
      d, 5,
    );
    p.lean = lean;

    const widen = this.micro.widen;
    const lidBase = e.eyeOpen + widen * 0.18;
    p.eyeOpenL = clamp(lidBase * (1 - this.blink.value) - this.micro.squint * 0.18, 0.02, 1.35);
    p.eyeOpenR = clamp(
      lidBase * (1 - clamp(this.blink.value + this.blinkAsym, 0, 1)) - this.micro.squint * 0.18,
      0.02, 1.35,
    );
    p.gazeX = this.gazeCur.x;
    p.gazeY = this.gazeCur.y;
    p.pupil = damp(p.pupil, e.pupil, d, 5);
    p.squint = damp(p.squint, e.squint + this.micro.squint * 0.5, d, 6);

    const browBase = e.brow + this.micro.brow * 0.55;
    p.browL = damp(p.browL, browBase, d, 7);
    p.browR = damp(p.browR, browBase * (1 - this.gazeAsym * 0.25), d, 7);
    p.browY = damp(
      p.browY,
      e.browY - this.micro.brow * 3.2 - (speaking ? this.articulation * 1.6 : 0),
      d, 7,
    );
    p.browInner = damp(p.browInner, e.browInner, d, 5);

    p.smile = damp(p.smile, clamp(e.smile + this.micro.smile * 0.35, -1, 1), d, 5);
    p.blush = damp(p.blush, e.blush + (speaking ? 0.1 : 0), d, 2.5);
    p.arms = arms;
    p.hairLag = headTurn - hairSide;
    p.hairBangs = headTurn * 0.7 - hairBang;
    p.hairBack = headTurn * 0.9 - hairBack;
    p.energy = energy * (speaking ? 1.15 : 1);

    return p;
  }

  /* ------------------------------------------------------------ internals */

  private pickGesture(): GestureName {
    const pool: GestureName[] =
      this.emotion === "excited" || this.emotion === "happy"
        ? ["excited", "explain", "openHands", "beat", "beat"]
        : this.emotion === "sad" || this.emotion === "shy" || this.emotion === "embarrassed"
          ? ["handToChest", "beat", "beat", "shrug"]
          : this.emotion === "confused" || this.emotion === "worried"
            ? ["shrug", "thinking", "beat", "openHands"]
            : this.emotion === "angry" || this.emotion === "alert"
              ? ["point", "beat", "explain"]
              : ["explain", "openHands", "beat", "beat", "point"];
    return pool[Math.floor(Math.random() * pool.length)] ?? "beat";
  }

  private updateBeats(dt: number, t: number, speaking: boolean, listening: boolean, thinking: boolean) {
    if (t > this.nextBeatAt) {
      if (speaking) {
        this.beat.nod = rand(0.3, 1.3);
        this.beat.turn = rand(-2.5, 2.5);
        this.beat.push = rand(-0.15, 0.35);
        this.nextBeatAt = t + rand(0.7, 1.9);
      } else if (listening) {
        // Attentive micro-nods: "I'm listening".
        this.beat.nod = rand(0.5, 1.1);
        this.beat.turn = rand(-1.2, 1.2);
        this.nextBeatAt = t + rand(1.2, 2.8);
      } else if (thinking) {
        this.beat.turn = rand(-3, 3);
        this.beat.nod = rand(-0.2, 0.4);
        this.nextBeatAt = t + rand(1.4, 3);
      } else {
        this.beat.turn = rand(-1.5, 1.5);
        this.beat.nod = rand(-0.2, 0.5);
        this.nextBeatAt = t + rand(2.5, 6);
      }
    }
    // Beats decay so nothing holds a pose forever.
    this.beat.nod = damp(this.beat.nod, 0, dt, 2.4);
    this.beat.turn = damp(this.beat.turn, 0, dt, 1.3);
    this.beat.push = damp(this.beat.push, 0, dt, 2);
  }

  private updateMicro(dt: number, t: number, speaking: boolean) {
    if (t > this.nextMicroAt) {
      const roll = Math.random();
      this.microTarget = { brow: 0, smile: 0, squint: 0, tilt: 0, widen: 0 };
      if (roll < 0.26) this.microTarget.brow = rand(0.25, 0.7);
      else if (roll < 0.45) this.microTarget.smile = rand(0.1, 0.4);
      else if (roll < 0.58) this.microTarget.smile = rand(-0.3, -0.1);
      else if (roll < 0.7) this.microTarget.widen = rand(0.2, 0.5);
      else if (roll < 0.82) this.microTarget.squint = rand(0.15, 0.4);
      else this.microTarget.tilt = rand(-2.5, 2.5);
      this.nextMicroAt = t + rand(speaking ? 1.1 : 2.2, speaking ? 3.2 : 6.5);
      // Release the accent shortly after it lands.
      setTimeout(() => {
        this.microTarget = { brow: 0, smile: 0, squint: 0, tilt: 0, widen: 0 };
      }, rand(320, 900));
    }
    const drift = this.nMicro.at(t * 0.5) * 0.06;
    this.micro.brow = damp(this.micro.brow, this.microTarget.brow + drift, dt, 6);
    this.micro.smile = damp(this.micro.smile, this.microTarget.smile, dt, 4);
    this.micro.squint = damp(this.micro.squint, this.microTarget.squint, dt, 5);
    this.micro.tilt = damp(this.micro.tilt, this.microTarget.tilt, dt, 3);
    this.micro.widen = damp(this.micro.widen, this.microTarget.widen, dt, 7);
  }

  private updateBlink(dt: number, t: number, e: EmotionPose) {
    const b = this.blink;
    if (b.phase === "idle" && t > this.nextBlinkAt) {
      const roll = Math.random();
      if (roll < 0.12) {
        // slow, heavy blink
        b.closeDur = rand(0.13, 0.18); b.holdDur = rand(0.06, 0.12); b.openDur = rand(0.16, 0.24);
      } else if (roll < 0.24) {
        // quick flick
        b.closeDur = 0.045; b.holdDur = 0.01; b.openDur = 0.055;
      } else {
        b.closeDur = rand(0.055, 0.085); b.holdDur = rand(0.01, 0.03); b.openDur = rand(0.07, 0.11);
      }
      if (roll > 0.82) b.queued = 1; // double blink
      this.blinkAsym = chance(0.25) ? rand(0.05, 0.2) : 0; // slight asymmetry
      b.phase = "close";
      b.t = 0;
    }

    if (b.phase !== "idle") {
      b.t += dt;
      if (b.phase === "close") {
        b.value = smoothstep(0, b.closeDur, b.t);
        if (b.t >= b.closeDur) { b.phase = "hold"; b.t = 0; b.value = 1; }
      } else if (b.phase === "hold") {
        b.value = 1;
        if (b.t >= b.holdDur) { b.phase = "open"; b.t = 0; }
      } else {
        b.value = 1 - smoothstep(0, b.openDur, b.t);
        if (b.t >= b.openDur) {
          b.value = 0;
          b.phase = "idle";
          b.t = 0;
          if (b.queued > 0) {
            b.queued -= 1;
            this.nextBlinkAt = t + rand(0.1, 0.2);
          } else {
            const rate = Math.max(0.35, e.blinkRate);
            this.nextBlinkAt = t + rand(2, 6.5) / rate;
          }
        }
      }
    }
  }

  private updateGaze(
    dt: number, t: number, e: EmotionPose,
    listening: boolean, thinking: boolean, speaking: boolean,
  ) {
    if (t > this.nextGazeAt) {
      const away = e.gazeAway + (thinking ? 0.4 : 0) + (speaking ? 0.12 : 0) - (listening ? 0.1 : 0);
      if (chance(clamp(away, 0, 0.95))) {
        // look slightly away
        this.gazeTarget = {
          x: rand(0.25, 0.9) * (chance(0.5) ? 1 : -1),
          y: thinking ? rand(-0.75, -0.25) : rand(-0.5, 0.45),
        };
        this.nextGazeAt = t + rand(0.7, 2.1);
      } else {
        // return to eye contact
        this.gazeTarget = { x: rand(-0.08, 0.08), y: rand(-0.06, 0.06) };
        this.nextGazeAt = t + rand(1.4, 3.6);
      }
      this.gazeAsym = rand(0, 0.25);
    }

    // Micro-saccades: tiny, fast, never perfectly still.
    if (t > this.nextSaccadeAt) {
      this.saccade = { x: rand(-0.09, 0.09), y: rand(-0.06, 0.06) };
      this.nextSaccadeAt = t + rand(0.18, 0.9);
    }

    const followPointer = !thinking;
    const tx = this.gazeTarget.x + this.saccade.x + (followPointer ? this.pointer.x * 0.45 : 0);
    const ty = this.gazeTarget.y + this.saccade.y + (followPointer ? this.pointer.y * 0.35 : 0);

    // Eyes accelerate fast, settle smoothly — never a linear jump.
    this.gazeCur.x = damp(this.gazeCur.x, clamp(tx, -1, 1), dt, 13);
    this.gazeCur.y = damp(this.gazeCur.y, clamp(ty, -1, 1), dt, 11);
  }

  private updateMouth(dt: number, t: number, speaking: boolean) {
    // Drop expired visemes, find the active one.
    let active: (VisemeEvent & { start: number }) | null = null;
    for (let i = 0; i < this.visemeQueue.length; i += 1) {
      const ev = this.visemeQueue[i]!;
      if (t >= ev.start && t < ev.start + ev.duration) { active = ev; break; }
    }
    if (this.visemeQueue.length && t - (this.visemeQueue[0]?.start ?? 0) > 6) {
      this.visemeQueue = this.visemeQueue.filter((ev) => ev.start + ev.duration > t);
    }

    if (active) {
      const shape = MOUTH[active.viseme];
      const s = active.strength;
      this.mouthTarget = {
        open: shape.open * s,
        wide: shape.wide * s,
        round: shape.round * s,
        teeth: shape.teeth * s,
        tongue: shape.tongue * s,
        press: shape.press,
      };
      this.articulation = damp(this.articulation, shape.open * s, dt, 14);
    } else if (speaking && this.audioLevel > 0.02) {
      // Fallback: audio-driven, but still shaped through vowel visemes.
      const l = this.audioLevel;
      const vowel = l > 0.75 ? MOUTH.A : l > 0.5 ? MOUTH.E : l > 0.3 ? MOUTH.O : MOUTH.I;
      this.mouthTarget = {
        open: vowel.open * l, wide: vowel.wide * l, round: vowel.round * l,
        teeth: vowel.teeth * l, tongue: vowel.tongue * l, press: 0,
      };
      this.articulation = damp(this.articulation, l, dt, 12);
    } else {
      this.mouthTarget = { ...NEUTRAL_MOUTH };
      this.articulation = damp(this.articulation, 0, dt, 8);
    }

    // Smooth co-articulation between shapes.
    const rate = 1 - Math.exp(-22 * dt);
    this.mouthCur = blendMouth(this.mouthCur, this.mouthTarget, rate);
    this.pose.mouth = this.mouthCur;
  }
}

/** Single shared rig instance — the whole app talks to this. */
export const rig = new AvatarRig();

export { lerp };