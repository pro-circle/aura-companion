import { useEffect, useMemo, useRef } from "react";

import { useAuraStore } from "@/lib/aura/store";
import { getSpeechLevel } from "@/lib/aura/speech";
import type { AvatarState, Emotion } from "@/lib/aura/types";

/**
 * Hand-rigged anime avatar (pure SVG + rAF).
 * Blinking, eye tracking, brow/mouth expression morphs, breathing,
 * head turn with lagging hair follow-through and speech-driven lip sync.
 */

interface Pose {
  brow: number; // -1 angry/focused .. 1 raised
  browY: number;
  eyeOpen: number; // 0..1.15
  smile: number; // -1 sad .. 1 grin
  blush: number; // 0..1
  pupil: number; // scale
}

const POSE: Record<Emotion, Pose> = {
  neutral: { brow: 0.1, browY: 0, eyeOpen: 1, smile: 0.35, blush: 0.35, pupil: 1 },
  happy: { brow: 0.5, browY: -2, eyeOpen: 0.86, smile: 1, blush: 0.8, pupil: 1.06 },
  surprised: { brow: 1, browY: -6, eyeOpen: 1.15, smile: 0.15, blush: 0.5, pupil: 1.15 },
  confused: { brow: -0.45, browY: -1, eyeOpen: 0.95, smile: -0.15, blush: 0.4, pupil: 0.98 },
  alert: { brow: -0.8, browY: -3, eyeOpen: 1.08, smile: 0, blush: 0.3, pupil: 0.9 },
  sad: { brow: -0.9, browY: 3, eyeOpen: 0.8, smile: -0.6, blush: 0.45, pupil: 1.02 },
};

const IRIS: Record<Emotion, [string, string]> = {
  neutral: ["#9fe6ff", "#1f7fd6"],
  happy: ["#b6f2ff", "#1e93d8"],
  surprised: ["#c9ecff", "#3b6fe0"],
  confused: ["#d6c8ff", "#6b57d6"],
  alert: ["#ffd9a8", "#e0862f"],
  sad: ["#bcd0ff", "#4b6bc0"],
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
  const mouthOpen = useRef<SVGEllipseElement>(null);
  const mouthLine = useRef<SVGPathElement>(null);
  const blushG = useRef<SVGGElement>(null);

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
    let blink = 0; // 0..1 closed
    let blinkPhase: "none" | "close" | "open" = "none";

    const cur = { turn: 0, tilt: 0, hair: 0, open: 1, smile: 0.3, brow: 0, browY: 0, mouth: 0, blush: 0.3 };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const state = stateRef.current;
      const pose = POSE[emotionRef.current];

      // --- head look ---
      const idleTurn = Math.sin(t * 0.42) * 3.2 + Math.sin(t * 0.17) * 2.1;
      const targetTurn = idleTurn + pointer.current.x * 7;
      const targetTilt = Math.sin(t * 0.31) * 1.6 + pointer.current.y * 3;
      cur.turn = damp(cur.turn, targetTurn, dt, 3.2);
      cur.tilt = damp(cur.tilt, targetTilt, dt, 3);
      // hair lags behind the head -> follow-through
      cur.hair = damp(cur.hair, cur.turn, dt, 1.5);
      const lag = cur.turn - cur.hair;

      const breathe = Math.sin(t * 1.15) * 1.5 + (state === "speaking" ? Math.sin(t * 3) * 0.6 : 0);

      if (head.current) {
        head.current.setAttribute(
          "transform",
          `translate(200 200) rotate(${cur.tilt * 0.6}) translate(${cur.turn * 1.5} ${breathe * 0.5}) translate(-200 -200)`,
        );
      }
      if (body.current) {
        body.current.setAttribute(
          "transform",
          `translate(${cur.turn * 0.5} ${breathe}) rotate(${cur.tilt * 0.15} 200 420)`,
        );
      }
      const sway = Math.sin(t * 0.8) * 1.4;
      if (hairL.current) {
        hairL.current.setAttribute(
          "transform",
          `rotate(${-lag * 0.9 + sway} 120 150) translate(${cur.hair * 0.9} 0)`,
        );
      }
      if (hairR.current) {
        hairR.current.setAttribute(
          "transform",
          `rotate(${-lag * 0.9 - sway} 280 150) translate(${cur.hair * 0.9} 0)`,
        );
      }
      if (bangs.current) {
        bangs.current.setAttribute(
          "transform",
          `translate(${cur.turn * 0.9 - lag * 0.6} ${Math.sin(t * 1.3) * 0.8})`,
        );
      }

      // --- blinking ---
      if (blinkPhase === "none" && now > blinkAt) {
        blinkPhase = "close";
      }
      if (blinkPhase === "close") {
        blink += dt * 14;
        if (blink >= 1) {
          blink = 1;
          blinkPhase = "open";
        }
      } else if (blinkPhase === "open") {
        blink -= dt * 9;
        if (blink <= 0) {
          blink = 0;
          blinkPhase = "none";
          blinkAt = now + 1600 + Math.random() * 3600;
        }
      }

      const listening = state === "listening";
      const targetOpen = pose.eyeOpen * (listening ? 1.06 : 1) * (1 - blink);
      cur.open = damp(cur.open, targetOpen, dt, 20);
      const lidScale = Math.max(0.02, cur.open);
      lidL.current?.setAttribute("transform", `translate(155 206) scale(1 ${lidScale}) translate(-155 -206)`);
      lidR.current?.setAttribute("transform", `translate(245 206) scale(1 ${lidScale}) translate(-245 -206)`);

      // --- eye tracking (clamped so the iris stays inside the eye) ---
      const gx = Math.max(-4, Math.min(4, pointer.current.x * 3.6 + Math.sin(t * 0.6) * 0.9));
      const gy = Math.max(-3, Math.min(3, pointer.current.y * 2.4));
      const gaze = (cx: number) =>
        `translate(${gx} ${gy}) translate(${cx} 206) scale(${pose.pupil}) translate(${-cx} -206)`;
      pupils.current?.setAttribute("transform", gaze(155));
      pupilsR.current?.setAttribute("transform", gaze(245));

      // --- brows ---
      cur.brow = damp(cur.brow, pose.brow, dt, 6);
      cur.browY = damp(cur.browY, pose.browY + (state === "thinking" ? -2 : 0), dt, 6);
      browL.current?.setAttribute(
        "transform",
        `translate(0 ${cur.browY}) rotate(${cur.brow * 7} 155 172)`,
      );
      browR.current?.setAttribute(
        "transform",
        `translate(0 ${cur.browY}) rotate(${-cur.brow * 7} 245 172)`,
      );

      // --- mouth / lip sync ---
      let target = 0;
      if (state === "speaking") {
        const level = getSpeechLevel();
        const flutter =
          0.55 + 0.45 * Math.sin(t * 11.3) * Math.sin(t * 4.7) + 0.2 * Math.sin(t * 19);
        target = Math.max(0.08, level * Math.abs(flutter));
      } else if (state === "listening") {
        target = 0.05;
      }
      cur.mouth = damp(cur.mouth, target, dt, 22);
      cur.smile = damp(cur.smile, pose.smile, dt, 6);

      if (mouthOpen.current) {
        const ry = 1.5 + cur.mouth * 13;
        const rx = 7 + cur.mouth * 5.5;
        mouthOpen.current.setAttribute("ry", String(ry));
        mouthOpen.current.setAttribute("rx", String(rx));
        mouthOpen.current.setAttribute("opacity", String(Math.min(1, cur.mouth * 4)));
      }
      if (mouthLine.current) {
        const c = cur.smile * 7;
        mouthLine.current.setAttribute(
          "d",
          `M186 ${252 - c * 0.2} Q200 ${252 + c} 214 ${252 - c * 0.2}`,
        );
        mouthLine.current.setAttribute("opacity", String(Math.max(0, 1 - cur.mouth * 2.2)));
      }
      mouth.current?.setAttribute("transform", `translate(0 ${cur.mouth * 1.5})`);

      cur.blush = damp(cur.blush, pose.blush + (state === "speaking" ? 0.15 : 0), dt, 3);
      blushG.current?.setAttribute("opacity", String(cur.blush * 0.55));

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
          <stop offset="0%" stopColor="#cdf2ff" />
          <stop offset="40%" stopColor="#8fdcf5" />
          <stop offset="100%" stopColor="#4fbadf" />
        </linearGradient>
        <linearGradient id="hairBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a4e4f7" />
          <stop offset="55%" stopColor="#6cc7e9" />
          <stop offset="100%" stopColor="#3ba2cc" />
        </linearGradient>
        <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff6ef" />
          <stop offset="100%" stopColor="#ffe2d4" />
        </linearGradient>
        <linearGradient id="dress" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e8f6fd" />
        </linearGradient>
        <radialGradient id="irisGrad" cx="50%" cy="30%" r="75%">
          <stop offset="0%" stopColor={iris[0]} />
          <stop offset="60%" stopColor={iris[1]} />
          <stop offset="100%" stopColor="#12407f" />
        </radialGradient>
        <radialGradient id="blushGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff9aa6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ff9aa6" stopOpacity="0" />
        </radialGradient>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id="eyeClipL">
          <ellipse cx="155" cy="206" rx="24" ry="27" />
        </clipPath>
        <clipPath id="eyeClipR">
          <ellipse cx="245" cy="206" rx="24" ry="27" />
        </clipPath>
      </defs>

      {/* aura bloom */}
      <ellipse cx="200" cy="250" rx="170" ry="210" fill="var(--sky-bloom)" opacity="0.22" filter="url(#soft)" />

      <g ref={body}>
        {/* ---- back hair: long, wavy, curled tips ---- */}
        <g ref={hairL}>
          <path
            d="M126 116 C58 168 38 268 46 356 C52 420 74 470 96 508 L150 508
               C120 470 100 424 96 372 C120 404 140 418 160 424
               C124 398 106 352 108 300 C110 244 122 174 160 128 Z"
            fill="url(#hairBack)"
          />
          <path
            d="M70 300 C60 366 70 434 96 486"
            stroke="#cdf2ff"
            strokeWidth="5"
            fill="none"
            opacity="0.45"
          />
          <path
            d="M98 210 C82 258 78 320 86 372"
            stroke="#cdf2ff"
            strokeWidth="4"
            fill="none"
            opacity="0.35"
          />
        </g>
        <g ref={hairR}>
          <path
            d="M274 116 C342 168 362 268 354 356 C348 420 326 470 304 508 L250 508
               C280 470 300 424 304 372 C280 404 260 418 240 424
               C276 398 294 352 292 300 C290 244 278 174 240 128 Z"
            fill="url(#hairBack)"
          />
          <path
            d="M330 300 C340 366 330 434 304 486"
            stroke="#cdf2ff"
            strokeWidth="5"
            fill="none"
            opacity="0.45"
          />
          <path
            d="M302 210 C318 258 322 320 314 372"
            stroke="#cdf2ff"
            strokeWidth="4"
            fill="none"
            opacity="0.35"
          />
        </g>

        {/* ---- bare shoulders ---- */}
        <path
          d="M200 322 C244 322 274 344 292 376 C304 398 312 424 316 452 L84 452
             C88 424 96 398 108 376 C126 344 156 322 200 322 Z"
          fill="url(#skin)"
        />

        {/* ---- dress bodice (off-shoulder) ---- */}
        <path
          d="M200 356 C238 356 262 366 276 380 C290 412 300 456 304 508 L96 508
             C100 456 110 412 124 380 C138 366 162 356 200 356 Z"
          fill="url(#dress)"
        />
        {/* bodice ruffle trim */}
        <path
          d="M124 380 C150 396 250 396 276 380"
          stroke="#bfe6f7"
          strokeWidth="3"
          fill="none"
        />
        {[136, 156, 176, 200, 224, 244, 264].map((x, i) => (
          <circle key={x} cx={x} cy={386 + (i % 2) * 3} r="6" fill="#ffffff" opacity="0.9" />
        ))}
        {/* skirt ruffle hem */}
        <path
          d="M104 468 C140 492 260 492 296 468"
          stroke="#a9dcf3"
          strokeWidth="3"
          fill="none"
          opacity="0.8"
        />
        {[110, 132, 154, 176, 200, 224, 246, 268, 290].map((x) => (
          <circle key={`h${x}`} cx={x} cy={478} r="9" fill="#ffffff" opacity="0.85" />
        ))}

        {/* puffed sleeves */}
        <ellipse cx="112" cy="392" rx="26" ry="22" fill="#ffffff" />
        <ellipse cx="288" cy="392" rx="26" ry="22" fill="#ffffff" />
        <path d="M92 396 C104 408 122 408 134 396" stroke="#cdeaf8" strokeWidth="3" fill="none" />
        <path d="M266 396 C278 408 296 408 308 396" stroke="#cdeaf8" strokeWidth="3" fill="none" />

        {/* blue ribbon bow */}
        <g>
          <path d="M200 416 l-26 -13 v26 z" fill="#7fd0ee" />
          <path d="M200 416 l26 -13 v26 z" fill="#7fd0ee" />
          <path d="M196 424 l-8 26 M204 424 l8 26" stroke="#7fd0ee" strokeWidth="5" strokeLinecap="round" />
          <circle cx="200" cy="416" r="7.5" fill="#a9e4fb" />
        </g>

        {/* neck */}
        <path d="M180 292 h40 v32 c0 14 -40 14 -40 0 z" fill="#f3cbba" />

        {/* clasped hands under the chin */}
        <g>
          <path
            d="M186 328 C176 320 178 306 190 304 C200 302 206 310 208 318
               C212 310 220 306 228 312 C236 318 232 332 222 338
               C214 344 196 342 186 328 Z"
            fill="url(#skin)"
          />
          <path d="M192 316 C198 312 204 314 208 320" stroke="#eab7a4" strokeWidth="2" fill="none" />
          <path d="M200 326 C208 322 214 324 218 330" stroke="#eab7a4" strokeWidth="2" fill="none" />
          {/* forearms */}
          <path d="M150 402 C160 372 176 346 188 332" stroke="#ffe2d4" strokeWidth="20" strokeLinecap="round" fill="none" />
          <path d="M250 402 C240 372 224 346 216 334" stroke="#ffe2d4" strokeWidth="20" strokeLinecap="round" fill="none" />
          {/* sleeve frills at wrist */}
          <ellipse cx="150" cy="392" rx="17" ry="13" fill="#ffffff" />
          <ellipse cx="250" cy="392" rx="17" ry="13" fill="#ffffff" />
        </g>
      </g>

      <g ref={head}>
        {/* face */}
        <path
          d="M200 106 C140 106 116 152 116 202 C116 250 142 292 200 306 C258 292 284 250 284 202 C284 152 260 106 200 106 Z"
          fill="url(#skin)"
        />
        {/* ears */}
        <ellipse cx="117" cy="212" rx="10" ry="16" fill="#f9dccf" />
        <ellipse cx="283" cy="212" rx="10" ry="16" fill="#f9dccf" />

        {/* blush */}
        <g ref={blushG} opacity="0.35">
          <ellipse cx="144" cy="240" rx="24" ry="12" fill="url(#blushGrad)" />
          <ellipse cx="256" cy="240" rx="24" ry="12" fill="url(#blushGrad)" />
        </g>

        {/* eyes */}
        <g>
          <ellipse cx="155" cy="206" rx="24" ry="27" fill="#ffffff" />
          <ellipse cx="245" cy="206" rx="24" ry="27" fill="#ffffff" />
          <g clipPath="url(#eyeClipL)">
            <g ref={pupils}>
              <ellipse cx="155" cy="207" rx="17" ry="21" fill="url(#irisGrad)" />
              <ellipse cx="155" cy="212" rx="9" ry="11" fill="#0b2f60" opacity="0.6" />
              <ellipse cx="155" cy="221" rx="13" ry="7" fill="#8fe0ff" opacity="0.45" />
              <circle cx="149" cy="198" r="6.2" fill="#ffffff" opacity="0.97" />
              <circle cx="162" cy="215" r="3.2" fill="#ffffff" opacity="0.75" />
            </g>
          </g>
          <g clipPath="url(#eyeClipR)">
            <g ref={pupilsR}>
              <ellipse cx="245" cy="207" rx="17" ry="21" fill="url(#irisGrad)" />
              <ellipse cx="245" cy="212" rx="9" ry="11" fill="#0b2f60" opacity="0.6" />
              <ellipse cx="245" cy="221" rx="13" ry="7" fill="#8fe0ff" opacity="0.45" />
              <circle cx="239" cy="198" r="6.2" fill="#ffffff" opacity="0.97" />
              <circle cx="252" cy="215" r="3.2" fill="#ffffff" opacity="0.75" />
            </g>
          </g>

          {/* lashes / lids (scaled for blink) */}
          <g ref={lidL}>
            <path
              d="M131 197 C138 176 174 176 179 195"
              stroke="#2f3d59"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M131 195 l-8 -7" stroke="#2f3d59" strokeWidth="5.5" strokeLinecap="round" />
            <ellipse cx="155" cy="206" rx="24" ry="27" fill="none" stroke="#4d5c78" strokeWidth="2" opacity="0.25" />
          </g>
          <g ref={lidR}>
            <path
              d="M221 195 C226 176 262 176 269 197"
              stroke="#2f3d59"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M269 195 l8 -7" stroke="#2f3d59" strokeWidth="5.5" strokeLinecap="round" />
            <ellipse cx="245" cy="206" rx="24" ry="27" fill="none" stroke="#4d5c78" strokeWidth="2" opacity="0.25" />
          </g>
        </g>

        {/* brows */}
        <g ref={browL}>
          <path d="M134 168 Q155 160 176 166" stroke="#86cfe9" strokeWidth="5" strokeLinecap="round" fill="none" />
        </g>
        <g ref={browR}>
          <path d="M224 166 Q245 160 266 168" stroke="#86cfe9" strokeWidth="5" strokeLinecap="round" fill="none" />
        </g>

        {/* nose */}
        <path d="M200 234 q3 5 -2 6" stroke="#e5b3a1" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* mouth — small gentle smile */}
        <g ref={mouth}>
          <ellipse ref={mouthOpen} cx="200" cy="254" rx="7" ry="2" fill="#c2566a" opacity="0" />
          <path
            ref={mouthLine}
            d="M188 251 Q200 258 212 251"
            stroke="#c2566a"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* bangs — center-parted, layered, with long face-framing locks */}
        <g ref={bangs}>
          <path
            d="M110 206 C102 128 138 74 200 74 C262 74 298 128 290 206
               C284 178 274 158 262 148 C258 178 250 194 238 206
               C238 170 228 142 210 124 C202 152 186 180 166 198
               C160 174 152 158 142 150 C130 164 118 182 110 206 Z"
            fill="url(#hairGrad)"
          />
          {/* face-framing side locks with soft curl */}
          <path
            d="M116 146 C98 194 96 258 106 306 C112 268 112 226 122 196 C126 180 124 160 116 146 Z"
            fill="url(#hairGrad)"
          />
          <path
            d="M284 146 C302 194 304 258 294 306 C288 268 288 226 278 196 C274 180 276 160 284 146 Z"
            fill="url(#hairGrad)"
          />
          {/* thin wisps */}
          <path d="M150 122 C138 152 134 186 138 214" stroke="#e2f8ff" strokeWidth="2.5" fill="none" opacity="0.6" />
          <path d="M252 120 C264 150 268 184 264 212" stroke="#e2f8ff" strokeWidth="2.5" fill="none" opacity="0.6" />

          {/* flower clusters */}
          {[
            { x: 132, y: 112, s: 1 },
            { x: 108, y: 136, s: 0.72 },
            { x: 154, y: 96, s: 0.62 },
            { x: 268, y: 108, s: 1.05 },
            { x: 292, y: 134, s: 0.7 },
            { x: 246, y: 94, s: 0.6 },
          ].map((f) => (
            <g key={`${f.x}-${f.y}`} transform={`translate(${f.x} ${f.y}) scale(${f.s})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse
                  key={a}
                  cx="0"
                  cy="-10"
                  rx="7"
                  ry="10"
                  fill="#f7fcff"
                  stroke="#dceffa"
                  strokeWidth="1"
                  transform={`rotate(${a})`}
                />
              ))}
              <circle r="4.5" fill="#d7f0ff" />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}

