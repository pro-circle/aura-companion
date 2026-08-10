import { useEffect, useMemo, useRef } from "react";

import { useAuraStore } from "@/lib/aura/store";
import { getSpeechLevel } from "@/lib/aura/speech";
import type { AvatarState, Emotion } from "@/lib/aura/types";

/**
 * Hand-rigged anime avatar (pure SVG + rAF) styled after the reference frames:
 * chin-length blue-black bob, soft grey eyes with big catchlights, warm blush,
 * yellow cardigan over a pale inner top.
 *
 * Body language layer: breathing, weight shifts, shoulder rise, head nods on
 * stressed syllables, lean-in while listening, recoil on surprise, and a
 * gesturing right hand that punctuates speech.
 */

interface Pose {
  brow: number; // -1 worried/angled .. 1 raised
  browY: number;
  eyeOpen: number; // 0..1.2
  smile: number; // -1 sad .. 1 grin
  blush: number; // 0..1
  pupil: number; // scale
  lean: number; // -1 pull back .. 1 lean in
  shoulder: number; // 0..1 raised
  gesture: number; // 0..1 hand animation amount
}

const POSE: Record<Emotion, Pose> = {
  neutral: { brow: 0.05, browY: 0, eyeOpen: 1, smile: 0.3, blush: 0.5, pupil: 1, lean: 0.1, shoulder: 0.1, gesture: 0.35 },
  happy: { brow: 0.45, browY: -2, eyeOpen: 0.92, smile: 1, blush: 0.85, pupil: 1.05, lean: 0.45, shoulder: 0.3, gesture: 0.9 },
  surprised: { brow: 1, browY: -7, eyeOpen: 1.2, smile: 0.2, blush: 0.6, pupil: 1.16, lean: -0.6, shoulder: 0.7, gesture: 0.6 },
  confused: { brow: -0.5, browY: -1, eyeOpen: 0.96, smile: -0.1, blush: 0.5, pupil: 0.98, lean: -0.15, shoulder: 0.25, gesture: 0.5 },
  alert: { brow: -0.75, browY: -3, eyeOpen: 1.1, smile: 0.05, blush: 0.35, pupil: 0.9, lean: 0.5, shoulder: 0.45, gesture: 0.65 },
  sad: { brow: -0.95, browY: 3, eyeOpen: 0.82, smile: -0.55, blush: 0.55, pupil: 1.02, lean: -0.3, shoulder: -0.2, gesture: 0.12 },
};

/** Soft grey-brown irises, tinted subtly per emotion (matches the reference). */
const IRIS: Record<Emotion, [string, string]> = {
  neutral: ["#b9bdc4", "#4b4f58"],
  happy: ["#c6c9cf", "#55585f"],
  surprised: ["#c9ccd3", "#3f434b"],
  confused: ["#bcb9c6", "#4e4a5a"],
  alert: ["#c8bfb2", "#5b5045"],
  sad: ["#b3b9c6", "#474d5b"],
};

function damp(current: number, target: number, dt: number, rate = 8) {
  return current + (target - current) * Math.min(1, dt * rate);
}

export default function AnimeAvatar() {
  const avatarState = useAuraStore((s) => s.avatarState);
  const emotion = useAuraStore((s) => s.emotion);

  const stateRef = useRef<AvatarState>(avatarState);
  const emotionRef = useRef<Emotion>(emotion);
  stateRef.current = avatarState;
  emotionRef.current = emotion;

  const root = useRef<SVGSVGElement>(null);
  const stage = useRef<SVGGElement>(null);
  const head = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const hairL = useRef<SVGGElement>(null);
  const hairR = useRef<SVGGElement>(null);
  const bangs = useRef<SVGGElement>(null);
  const lidL = useRef<SVGGElement>(null);
  const lidR = useRef<SVGGElement>(null);
  const pupils = useRef<SVGGElement>(null);
  const pupilsR = useRef<SVGGElement>(null);
  const browL = useRef<SVGGElement>(null);
  const browR = useRef<SVGGElement>(null);
  const mouth = useRef<SVGGElement>(null);
  const mouthOpen = useRef<SVGPathElement>(null);
  const mouthLine = useRef<SVGPathElement>(null);
  const teeth = useRef<SVGPathElement>(null);
  const blushG = useRef<SVGGElement>(null);
  const armR = useRef<SVGGElement>(null);
  const armL = useRef<SVGGElement>(null);
  const shoulders = useRef<SVGGElement>(null);

  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let blinkAt = performance.now() + 1200;
    let blink = 0;
    let blinkPhase: "none" | "close" | "open" = "none";
    // idle "acting" beats: occasional nods, weight shifts, glances
    let beatAt = performance.now() + 2600;
    let beat = { nod: 0, shift: 0 };

    const cur = {
      turn: 0, tilt: 0, hair: 0, open: 1, smile: 0.3, brow: 0, browY: 0,
      mouth: 0, blush: 0.3, lean: 0, shoulder: 0, gesture: 0, nod: 0, shift: 0,
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const state = stateRef.current;
      const pose = POSE[emotionRef.current];
      const speaking = state === "speaking";
      const listening = state === "listening";
      const thinking = state === "thinking";
      const level = speaking ? getSpeechLevel() : 0;

      // --- idle acting beats -------------------------------------------------
      if (now > beatAt) {
        beat = {
          nod: (Math.random() - 0.3) * (speaking ? 3.5 : 2),
          shift: (Math.random() - 0.5) * 6,
        };
        beatAt = now + (speaking ? 900 : 2600) + Math.random() * 2200;
      }
      cur.nod = damp(cur.nod, beat.nod + (speaking ? level * 2.2 : 0), dt, 3);
      cur.shift = damp(cur.shift, beat.shift, dt, 1.2);

      // --- head look ---------------------------------------------------------
      const idleTurn = Math.sin(t * 0.42) * 3 + Math.sin(t * 0.17) * 2;
      const targetTurn = idleTurn + pointer.current.x * 7 + cur.shift * 0.4;
      const targetTilt =
        Math.sin(t * 0.31) * 1.6 + pointer.current.y * 3 + (thinking ? 5 : 0) + cur.nod * 0.8;
      cur.turn = damp(cur.turn, targetTurn, dt, 3.2);
      cur.tilt = damp(cur.tilt, targetTilt, dt, 3);
      cur.hair = damp(cur.hair, cur.turn, dt, 1.5);
      const lag = cur.turn - cur.hair;

      const breathe = Math.sin(t * 1.15) * 1.6 + (speaking ? Math.sin(t * 3) * 0.7 : 0);

      // --- lean / weight shift (whole stage) ---------------------------------
      cur.lean = damp(cur.lean, pose.lean + (listening ? 0.45 : 0) + (speaking ? 0.2 : 0), dt, 2.2);
      const leanZ = 1 + cur.lean * 0.045;
      stage.current?.setAttribute(
        "transform",
        `translate(200 300) scale(${leanZ}) translate(-200 -300) translate(${cur.shift * 0.5} ${-cur.lean * 6})`,
      );

      if (head.current) {
        head.current.setAttribute(
          "transform",
          `translate(200 200) rotate(${cur.tilt * 0.6}) translate(${cur.turn * 1.5} ${breathe * 0.5 + cur.nod * 1.4}) translate(-200 -200)`,
        );
      }
      if (body.current) {
        body.current.setAttribute(
          "transform",
          `translate(${cur.turn * 0.5} ${breathe}) rotate(${cur.tilt * 0.15} 200 460)`,
        );
      }
      cur.shoulder = damp(cur.shoulder, pose.shoulder + (speaking ? 0.12 : 0), dt, 4);
      shoulders.current?.setAttribute("transform", `translate(0 ${-cur.shoulder * 7})`);

      const sway = Math.sin(t * 0.8) * 1.4;
      hairL.current?.setAttribute(
        "transform",
        `rotate(${-lag * 0.9 + sway} 130 160) translate(${cur.hair * 0.9} 0)`,
      );
      hairR.current?.setAttribute(
        "transform",
        `rotate(${-lag * 0.9 - sway} 270 160) translate(${cur.hair * 0.9} 0)`,
      );
      bangs.current?.setAttribute(
        "transform",
        `translate(${cur.turn * 0.9 - lag * 0.6} ${Math.sin(t * 1.3) * 0.8})`,
      );

      // --- gesturing hands ---------------------------------------------------
      cur.gesture = damp(cur.gesture, speaking ? pose.gesture : pose.gesture * 0.25, dt, 2.5);
      const g = cur.gesture;
      const gr = Math.sin(t * 2.1) * 8 * g + level * 5 * g;
      const gl = Math.sin(t * 1.7 + 1.1) * 5 * g;
      armR.current?.setAttribute(
        "transform",
        `rotate(${-gr} 296 396) translate(${g * 6} ${-Math.abs(gr) * 0.4})`,
      );
      armL.current?.setAttribute("transform", `rotate(${gl * 0.6} 104 396) translate(${-g * 3} 0)`);

      // --- blinking ----------------------------------------------------------
      if (blinkPhase === "none" && now > blinkAt) blinkPhase = "close";
      if (blinkPhase === "close") {
        blink += dt * 14;
        if (blink >= 1) { blink = 1; blinkPhase = "open"; }
      } else if (blinkPhase === "open") {
        blink -= dt * 9;
        if (blink <= 0) { blink = 0; blinkPhase = "none"; blinkAt = now + 1600 + Math.random() * 3600; }
      }

      const targetOpen = pose.eyeOpen * (listening ? 1.06 : 1) * (1 - blink);
      cur.open = damp(cur.open, targetOpen, dt, 20);
      const lidScale = Math.max(0.02, cur.open);
      lidL.current?.setAttribute("transform", `translate(152 208) scale(1 ${lidScale}) translate(-152 -208)`);
      lidR.current?.setAttribute("transform", `translate(248 208) scale(1 ${lidScale}) translate(-248 -208)`);

      // --- eye tracking ------------------------------------------------------
      const glance = thinking ? Math.sin(t * 0.5) * 2.4 : 0;
      const gx = Math.max(-4.5, Math.min(4.5, pointer.current.x * 3.6 + Math.sin(t * 0.6) * 0.9 + glance));
      const gy = Math.max(-3, Math.min(3, pointer.current.y * 2.4 + (thinking ? -1.6 : 0)));
      const gaze = (cx: number) =>
        `translate(${gx} ${gy}) translate(${cx} 208) scale(${pose.pupil}) translate(${-cx} -208)`;
      pupils.current?.setAttribute("transform", gaze(152));
      pupilsR.current?.setAttribute("transform", gaze(248));

      // --- brows -------------------------------------------------------------
      cur.brow = damp(cur.brow, pose.brow, dt, 6);
      cur.browY = damp(cur.browY, pose.browY + (thinking ? -2 : 0) + (speaking ? -level * 1.4 : 0), dt, 6);
      browL.current?.setAttribute("transform", `translate(0 ${cur.browY}) rotate(${cur.brow * 7} 152 174)`);
      browR.current?.setAttribute("transform", `translate(0 ${cur.browY}) rotate(${-cur.brow * 7} 248 174)`);

      // --- mouth / lip sync --------------------------------------------------
      let target = 0;
      if (speaking) {
        const flutter = 0.55 + 0.45 * Math.sin(t * 11.3) * Math.sin(t * 4.7) + 0.2 * Math.sin(t * 19);
        target = Math.max(0.08, level * Math.abs(flutter));
      } else if (listening) {
        target = 0.05;
      }
      cur.mouth = damp(cur.mouth, target, dt, 22);
      cur.smile = damp(cur.smile, pose.smile, dt, 6);

      if (mouthOpen.current) {
        const h = 2 + cur.mouth * 15;
        const w = 11 + cur.mouth * 6;
        mouthOpen.current.setAttribute(
          "d",
          `M${200 - w} 250 Q200 ${250 - 3 - cur.smile * 2} ${200 + w} 250 Q200 ${250 + h} ${200 - w} 250 Z`,
        );
        mouthOpen.current.setAttribute("opacity", String(Math.min(1, cur.mouth * 4)));
      }
      if (teeth.current) {
        teeth.current.setAttribute("opacity", String(Math.min(0.95, cur.mouth * 3)));
      }
      if (mouthLine.current) {
        const c = cur.smile * 7;
        mouthLine.current.setAttribute("d", `M186 ${250 - c * 0.2} Q200 ${250 + c} 214 ${250 - c * 0.2}`);
        mouthLine.current.setAttribute("opacity", String(Math.max(0, 1 - cur.mouth * 2.2)));
      }
      mouth.current?.setAttribute("transform", `translate(0 ${cur.mouth * 1.5})`);

      cur.blush = damp(cur.blush, pose.blush + (speaking ? 0.15 : 0), dt, 3);
      blushG.current?.setAttribute("opacity", String(cur.blush * 0.8));

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const iris = useMemo(() => IRIS[emotion], [emotion]);

  return (
    <svg
      ref={root}
      viewBox="0 0 400 520"
      className="h-full w-full"
      preserveAspectRatio="xMidYMax meet"
      aria-label="AURA anime avatar"
      role="img"
    >
      <defs>
        <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b3047" />
          <stop offset="45%" stopColor="#1d2136" />
          <stop offset="100%" stopColor="#121524" />
        </linearGradient>
        <linearGradient id="hairBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22273c" />
          <stop offset="60%" stopColor="#161a2b" />
          <stop offset="100%" stopColor="#0d101c" />
        </linearGradient>
        <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff6ef" />
          <stop offset="100%" stopColor="#ffe6d8" />
        </linearGradient>
        <linearGradient id="cardigan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6d24f" />
          <stop offset="100%" stopColor="#e0b028" />
        </linearGradient>
        <linearGradient id="inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4f7fb" />
          <stop offset="100%" stopColor="#dbe6ef" />
        </linearGradient>
        <radialGradient id="irisGrad" cx="50%" cy="28%" r="78%">
          <stop offset="0%" stopColor={iris[0]} />
          <stop offset="62%" stopColor={iris[1]} />
          <stop offset="100%" stopColor="#22242b" />
        </radialGradient>
        <radialGradient id="blushGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff8f9e" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ff8f9e" stopOpacity="0" />
        </radialGradient>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id="eyeClipL">
          <ellipse cx="152" cy="208" rx="25" ry="28" />
        </clipPath>
        <clipPath id="eyeClipR">
          <ellipse cx="248" cy="208" rx="25" ry="28" />
        </clipPath>
        <clipPath id="mouthClip">
          <ellipse cx="200" cy="252" rx="20" ry="16" />
        </clipPath>
      </defs>

      {/* aura bloom */}
      <ellipse cx="200" cy="250" rx="170" ry="210" fill="var(--sky-bloom)" opacity="0.2" filter="url(#soft)" />

      <g ref={stage}>
        <g ref={body}>
          {/* ---- back hair: chin-length bob, slightly flicked tips ---- */}
          <g ref={hairL}>
            <path
              d="M132 120 C86 158 74 236 84 310 C90 352 104 380 118 400
                 C112 360 110 320 116 286 C122 246 128 176 162 132 Z"
              fill="url(#hairBack)"
            />
          </g>
          <g ref={hairR}>
            <path
              d="M268 120 C314 158 326 236 316 310 C310 352 296 380 282 400
                 C288 360 290 320 284 286 C278 246 272 176 238 132 Z"
              fill="url(#hairBack)"
            />
          </g>

          {/* ---- neck + shoulders ---- */}
          <path d="M181 288 h38 v34 c0 15 -38 15 -38 0 z" fill="#f2c6b4" />

          <g ref={shoulders}>
            {/* inner top */}
            <path
              d="M200 316 C232 316 258 332 274 356 C288 378 296 420 300 520 L100 520
                 C104 420 112 378 126 356 C142 332 168 316 200 316 Z"
              fill="url(#inner)"
            />
            {/* neckline shading */}
            <path d="M168 332 C182 352 218 352 232 332" stroke="#c7d4e0" strokeWidth="3" fill="none" />

            {/* yellow cardigan — open front */}
            <path
              d="M148 322 C120 336 104 368 98 404 C92 444 90 484 90 520 L162 520
                 C158 470 158 420 166 372 C170 350 166 332 148 322 Z"
              fill="url(#cardigan)"
            />
            <path
              d="M252 322 C280 336 296 368 302 404 C308 444 310 484 310 520 L238 520
                 C242 470 242 420 234 372 C230 350 234 332 252 322 Z"
              fill="url(#cardigan)"
            />
            {/* cardigan edge shading */}
            <path d="M166 372 C160 424 158 472 162 520" stroke="#c99a1f" strokeWidth="3" fill="none" opacity="0.6" />
            <path d="M234 372 C240 424 242 472 238 520" stroke="#c99a1f" strokeWidth="3" fill="none" opacity="0.6" />

            {/* arms / gesturing hands */}
            <g ref={armL}>
              <path d="M104 396 C96 434 96 476 100 516" stroke="#eec03a" strokeWidth="30" strokeLinecap="round" fill="none" />
              <ellipse cx="100" cy="514" rx="16" ry="14" fill="url(#skin)" />
            </g>
            <g ref={armR}>
              <path d="M296 396 C312 424 328 452 340 470" stroke="#eec03a" strokeWidth="30" strokeLinecap="round" fill="none" />
              {/* open palm, as in the reference gesture */}
              <g transform="translate(348 476)">
                <path
                  d="M-4 -10 C10 -18 26 -12 30 0 C34 12 24 22 10 22 C-4 22 -14 12 -12 2 Z"
                  fill="url(#skin)"
                />
                <path d="M2 -6 C10 -8 18 -4 22 2" stroke="#e7b6a3" strokeWidth="2" fill="none" />
                <path d="M0 4 C8 2 16 6 20 12" stroke="#e7b6a3" strokeWidth="2" fill="none" />
              </g>
            </g>
          </g>
        </g>

        <g ref={head}>
          {/* face */}
          <path
            d="M200 108 C142 108 118 152 118 202 C118 252 146 296 200 308 C254 296 282 252 282 202 C282 152 258 108 200 108 Z"
            fill="url(#skin)"
          />
          {/* ears */}
          <ellipse cx="119" cy="214" rx="10" ry="16" fill="#f9dccf" />
          <ellipse cx="281" cy="214" rx="10" ry="16" fill="#f9dccf" />

          {/* blush */}
          <g ref={blushG} opacity="0.5">
            <ellipse cx="141" cy="242" rx="26" ry="13" fill="url(#blushGrad)" />
            <ellipse cx="259" cy="242" rx="26" ry="13" fill="url(#blushGrad)" />
          </g>

          {/* eyes — large, soft grey, big catchlights */}
          <g>
            <ellipse cx="152" cy="208" rx="25" ry="28" fill="#ffffff" />
            <ellipse cx="248" cy="208" rx="25" ry="28" fill="#ffffff" />
            <g clipPath="url(#eyeClipL)">
              <g ref={pupils}>
                <ellipse cx="152" cy="209" rx="18" ry="22" fill="url(#irisGrad)" />
                <ellipse cx="152" cy="213" rx="8.5" ry="10.5" fill="#1b1d24" opacity="0.85" />
                <ellipse cx="152" cy="223" rx="13" ry="7" fill="#e6e9ee" opacity="0.35" />
                <circle cx="145" cy="199" r="6.6" fill="#ffffff" opacity="0.98" />
                <circle cx="160" cy="217" r="3.4" fill="#ffffff" opacity="0.8" />
              </g>
              {/* upper lid shadow */}
              <ellipse cx="152" cy="184" rx="26" ry="12" fill="#4a4f5c" opacity="0.28" />
            </g>
            <g clipPath="url(#eyeClipR)">
              <g ref={pupilsR}>
                <ellipse cx="248" cy="209" rx="18" ry="22" fill="url(#irisGrad)" />
                <ellipse cx="248" cy="213" rx="8.5" ry="10.5" fill="#1b1d24" opacity="0.85" />
                <ellipse cx="248" cy="223" rx="13" ry="7" fill="#e6e9ee" opacity="0.35" />
                <circle cx="241" cy="199" r="6.6" fill="#ffffff" opacity="0.98" />
                <circle cx="256" cy="217" r="3.4" fill="#ffffff" opacity="0.8" />
              </g>
              <ellipse cx="248" cy="184" rx="26" ry="12" fill="#4a4f5c" opacity="0.28" />
            </g>

            {/* lashes / lids */}
            <g ref={lidL}>
              <path d="M127 199 C134 176 172 176 177 197" stroke="#1b1f2e" strokeWidth="8.5" strokeLinecap="round" fill="none" />
              <path d="M127 197 l-9 -8" stroke="#1b1f2e" strokeWidth="6" strokeLinecap="round" />
              <path d="M133 224 C142 234 164 234 172 224" stroke="#3b3f4c" strokeWidth="2.2" fill="none" opacity="0.55" />
            </g>
            <g ref={lidR}>
              <path d="M223 197 C228 176 266 176 273 199" stroke="#1b1f2e" strokeWidth="8.5" strokeLinecap="round" fill="none" />
              <path d="M273 197 l9 -8" stroke="#1b1f2e" strokeWidth="6" strokeLinecap="round" />
              <path d="M228 224 C236 234 258 234 267 224" stroke="#3b3f4c" strokeWidth="2.2" fill="none" opacity="0.55" />
            </g>
          </g>

          {/* brows — thin, dark, slightly worried */}
          <g ref={browL}>
            <path d="M130 172 Q152 163 174 170" stroke="#26293a" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          </g>
          <g ref={browR}>
            <path d="M226 170 Q248 163 270 172" stroke="#26293a" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          </g>

          {/* nose */}
          <path d="M200 232 q3 5 -2 6" stroke="#e0a894" strokeWidth="2.5" strokeLinecap="round" fill="none" />

          {/* mouth */}
          <g ref={mouth}>
            <g clipPath="url(#mouthClip)">
              <path ref={mouthOpen} d="M189 250 Q200 247 211 250 Q200 252 189 250 Z" fill="#8e2f42" opacity="0" />
              <path ref={teeth} d="M186 248 h28 v5 h-28 z" fill="#ffffff" opacity="0" />
            </g>
            <path
              ref={mouthLine}
              d="M188 249 Q200 256 212 249"
              stroke="#b7455a"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          {/* bangs — soft center-parted curtain sitting above the brows */}
          <g ref={bangs}>
            <path
              d="M112 190 C106 124 142 70 200 70 C258 70 294 124 288 190
                 C280 164 268 148 254 140 C244 156 228 166 210 170
                 C206 146 202 128 200 116 C196 130 190 148 184 168
                 C166 164 152 152 144 138 C130 150 118 168 112 190 Z"
              fill="url(#hairGrad)"
            />
            {/* face-framing side locks down to the jaw */}
            <path d="M118 148 C102 196 100 262 110 312 C116 272 116 228 126 198 C130 182 126 162 118 148 Z" fill="url(#hairGrad)" />
            <path d="M282 148 C298 196 300 262 290 312 C284 272 284 228 274 198 C270 182 274 162 282 148 Z" fill="url(#hairGrad)" />
            {/* soft gloss */}
            <path d="M150 112 C178 96 222 96 250 114" stroke="#616a87" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.35" />
          </g>
        </g>
      </g>
    </svg>
  );
}
