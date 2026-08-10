import { useEffect, useMemo, useRef } from "react";

import { useAuraStore } from "@/lib/aura/store";
import { IRIS } from "@/lib/aura/rig/emotions";
import { rig } from "@/lib/aura/rig/rig";
import { clamp } from "@/lib/aura/rig/math";

/**
 * Layered anime avatar renderer.
 *
 * Every body part is an independently transformed SVG layer (back hair, side
 * hair, bangs, face, brows, lids, iris, pupils, mouth, teeth, tongue, neck,
 * torso, arms, hands, clothes). The component owns no animation logic: it
 * runs one rAF loop, asks `rig` for the blended pose and writes attributes
 * directly to the DOM, so React never re-renders during animation.
 */
export default function AnimeAvatar() {
  const avatarState = useAuraStore((s) => s.avatarState);
  const emotion = useAuraStore((s) => s.emotion);

  const svg = useRef<SVGSVGElement>(null);
  const stage = useRef<SVGGElement>(null);
  const bodyG = useRef<SVGGElement>(null);
  const torso = useRef<SVGGElement>(null);
  const shoulders = useRef<SVGGElement>(null);
  const neck = useRef<SVGGElement>(null);
  const headG = useRef<SVGGElement>(null);
  const faceG = useRef<SVGGElement>(null);
  const hairBackG = useRef<SVGGElement>(null);
  const hairSideL = useRef<SVGGElement>(null);
  const hairSideR = useRef<SVGGElement>(null);
  const bangs = useRef<SVGGElement>(null);
  const lidL = useRef<SVGGElement>(null);
  const lidR = useRef<SVGGElement>(null);
  const lowLidL = useRef<SVGGElement>(null);
  const lowLidR = useRef<SVGGElement>(null);
  const irisL = useRef<SVGGElement>(null);
  const irisR = useRef<SVGGElement>(null);
  const pupilL = useRef<SVGEllipseElement>(null);
  const pupilR = useRef<SVGEllipseElement>(null);
  const browL = useRef<SVGGElement>(null);
  const browR = useRef<SVGGElement>(null);
  const mouthG = useRef<SVGGElement>(null);
  const mouthInner = useRef<SVGPathElement>(null);
  const mouthLine = useRef<SVGPathElement>(null);
  const upperLip = useRef<SVGPathElement>(null);
  const teeth = useRef<SVGPathElement>(null);
  const tongue = useRef<SVGEllipseElement>(null);
  const blushG = useRef<SVGGElement>(null);
  const armLG = useRef<SVGGElement>(null);
  const armRG = useRef<SVGGElement>(null);
  const foreArmL = useRef<SVGGElement>(null);
  const foreArmR = useRef<SVGGElement>(null);
  const handL = useRef<SVGGElement>(null);
  const handR = useRef<SVGGElement>(null);

  // Push conversational state into the rig (it owns all timing).
  useEffect(() => {
    rig.setState(avatarState);
  }, [avatarState]);

  useEffect(() => {
    rig.setEmotion(emotion, 0.85);
  }, [emotion]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      rig.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const set = (el: Element | null, attr: string, value: string) => {
      el?.setAttribute(attr, value);
    };

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const p = rig.update(dt);

      /* ---- camera-ish stage: lean pushes her toward the lens ------------- */
      const zoom = 1 + p.lean * 0.04;
      set(
        stage.current, "transform",
        `translate(200 300) scale(${zoom.toFixed(4)}) translate(-200 -300) ` +
        `translate(${(p.bodySway * 0.5).toFixed(2)} ${(-p.lean * 5).toFixed(2)})`,
      );

      /* ---- torso / shoulders --------------------------------------------- */
      set(
        torso.current, "transform",
        `translate(${(p.bodySway * 0.6).toFixed(2)} ${p.breath.toFixed(2)}) ` +
        `rotate(${(p.headTilt * 0.12).toFixed(2)} 200 470)`,
      );
      set(shoulders.current, "transform", `translate(0 ${(-p.shoulder).toFixed(2)})`);
      set(
        neck.current, "transform",
        `rotate(${(p.headTilt * 0.35).toFixed(2)} 200 300) translate(${(p.headTurn * 0.5).toFixed(2)} 0)`,
      );

      /* ---- head ----------------------------------------------------------- */
      set(
        headG.current, "transform",
        `translate(200 210) rotate(${(p.headTilt * 0.7).toFixed(2)}) ` +
        `translate(${(p.headTurn * 1.5).toFixed(2)} ${(p.breath * 0.4 + p.headNod).toFixed(2)}) ` +
        `scale(${(1 + p.headPush * 0.02).toFixed(4)}) translate(-200 -210)`,
      );
      // Face plane slides slightly against the skull = perspective turn.
      set(faceG.current, "transform", `translate(${(p.headTurn * 0.45).toFixed(2)} 0)`);

      /* ---- hair (spring lag + overshoot) ---------------------------------- */
      set(
        hairBackG.current, "transform",
        `rotate(${(p.hairBack * 0.5).toFixed(2)} 200 130) translate(${(p.headTurn * 0.6).toFixed(2)} 0)`,
      );
      set(
        hairSideL.current, "transform",
        `rotate(${(p.hairLag * 0.9).toFixed(2)} 140 150) translate(${(p.headTurn * 0.8).toFixed(2)} 0)`,
      );
      set(
        hairSideR.current, "transform",
        `rotate(${(p.hairLag * 0.9).toFixed(2)} 260 150) translate(${(p.headTurn * 0.8).toFixed(2)} 0)`,
      );
      set(
        bangs.current, "transform",
        `translate(${(p.headTurn * 0.9 + p.hairBangs * 0.8).toFixed(2)} ${(p.hairBangs * 0.25).toFixed(2)})`,
      );

      /* ---- eyes ------------------------------------------------------------ */
      const lid = (el: Element | null, cx: number, open: number) =>
        set(el, "transform", `translate(${cx} 208) scale(1 ${clamp(open, 0.02, 1.35).toFixed(3)}) translate(${-cx} -208)`);
      lid(lidL.current, 152, p.eyeOpenL);
      lid(lidR.current, 248, p.eyeOpenR);
      set(lowLidL.current, "transform", `translate(0 ${(-p.squint * 6).toFixed(2)})`);
      set(lowLidR.current, "transform", `translate(0 ${(-p.squint * 6).toFixed(2)})`);

      const gx = p.gazeX * 5.5;
      const gy = p.gazeY * 3.6;
      set(irisL.current, "transform", `translate(${gx.toFixed(2)} ${gy.toFixed(2)}) translate(152 208) scale(${p.pupil.toFixed(3)}) translate(-152 -208)`);
      set(irisR.current, "transform", `translate(${(gx * 1.04).toFixed(2)} ${gy.toFixed(2)}) translate(248 208) scale(${p.pupil.toFixed(3)}) translate(-248 -208)`);
      // Pupils dilate a touch with emotional arousal.
      const dil = (1 + (p.energy - 1) * 0.12).toFixed(3);
      set(pupilL.current, "transform", `translate(152 213) scale(${dil}) translate(-152 -213)`);
      set(pupilR.current, "transform", `translate(248 213) scale(${dil}) translate(-248 -213)`);

      /* ---- brows ----------------------------------------------------------- */
      const inner = p.browInner * 4;
      set(browL.current, "transform", `translate(${(gx * 0.15).toFixed(2)} ${(p.browY - inner * 0.4).toFixed(2)}) rotate(${(p.browL * 8 - p.browInner * 9).toFixed(2)} 152 176)`);
      set(browR.current, "transform", `translate(${(gx * 0.15).toFixed(2)} ${(p.browY - inner * 0.4).toFixed(2)}) rotate(${(-p.browR * 8 + p.browInner * 9).toFixed(2)} 248 176)`);

      /* ---- mouth (viseme shapes) -------------------------------------------- */
      const m = p.mouth;
      const openPx = m.open * 17;
      const width = 13 + m.wide * 9 - m.round * 5;
      const cy = 252 + m.open * 2;
      const smileLift = p.smile * 6;

      set(
        mouthInner.current, "d",
        `M${(200 - width).toFixed(1)} ${cy.toFixed(1)} ` +
        `Q200 ${(cy - 3 - smileLift * 0.4).toFixed(1)} ${(200 + width).toFixed(1)} ${cy.toFixed(1)} ` +
        `Q200 ${(cy + openPx).toFixed(1)} ${(200 - width).toFixed(1)} ${cy.toFixed(1)} Z`,
      );
      set(mouthInner.current, "opacity", String(Math.min(1, m.open * 5)));
      set(teeth.current, "opacity", (m.teeth * Math.min(1, m.open * 4) * 0.95).toFixed(3));
      set(teeth.current, "d", `M${(200 - width * 0.8).toFixed(1)} ${cy.toFixed(1)} h${(width * 1.6).toFixed(1)} v${(2 + m.teeth * 3).toFixed(1)} h${(-width * 1.6).toFixed(1)} Z`);
      set(tongue.current, "opacity", (m.tongue * Math.min(1, m.open * 3)).toFixed(3));
      set(tongue.current, "cy", (cy + openPx * 0.72).toFixed(1));
      set(tongue.current, "rx", (width * 0.6).toFixed(1));
      set(tongue.current, "ry", (2 + m.tongue * 3.5).toFixed(1));
      set(
        upperLip.current, "d",
        `M${(200 - width - 1).toFixed(1)} ${(cy - 1).toFixed(1)} Q200 ${(cy - 4 - m.press * 2 - smileLift * 0.3).toFixed(1)} ${(200 + width + 1).toFixed(1)} ${(cy - 1).toFixed(1)}`,
      );
      set(
        mouthLine.current, "d",
        `M${(200 - 13 - p.smile * 2).toFixed(1)} ${(252 - smileLift * 0.25).toFixed(1)} ` +
        `Q200 ${(252 + smileLift).toFixed(1)} ${(200 + 13 + p.smile * 2).toFixed(1)} ${(252 - smileLift * 0.25).toFixed(1)}`,
      );
      set(mouthLine.current, "opacity", String(Math.max(0, 1 - m.open * 3)));
      set(mouthG.current, "transform", `translate(${(p.headTurn * 0.2).toFixed(2)} ${(m.open * 1.5).toFixed(2)})`);

      set(blushG.current, "opacity", (p.blush * 0.85).toFixed(3));

      /* ---- arms + hands ------------------------------------------------------ */
      const a = p.arms;
      set(armRG.current, "transform", `rotate(${a.rightArm.toFixed(2)} 288 372)`);
      set(foreArmR.current, "transform", `rotate(${a.rightElbow.toFixed(2)} 318 434)`);
      set(handR.current, "transform", `translate(340 480) rotate(${a.rightWrist.toFixed(2)}) scale(${(0.85 + a.rightOpen * 0.3).toFixed(3)})`);
      set(armLG.current, "transform", `rotate(${a.leftArm.toFixed(2)} 112 372)`);
      set(foreArmL.current, "transform", `rotate(${a.leftElbow.toFixed(2)} 82 434)`);
      set(handL.current, "transform", `translate(60 480) rotate(${a.leftWrist.toFixed(2)}) scale(${(0.85 + a.leftOpen * 0.3).toFixed(3)}, ${(0.85 + a.leftOpen * 0.3).toFixed(3)}) scale(-1 1)`);
      set(bodyG.current, "transform", `translate(0 ${(a.lean * -2).toFixed(2)})`);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const iris = useMemo(() => IRIS[emotion] ?? IRIS.neutral, [emotion]);

  return (
    <svg
      ref={svg}
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
        <linearGradient id="hairBackGrad" x1="0" y1="0" x2="0" y2="1">
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
        <clipPath id="eyeClipL"><ellipse cx="152" cy="208" rx="25" ry="28" /></clipPath>
        <clipPath id="eyeClipR"><ellipse cx="248" cy="208" rx="25" ry="28" /></clipPath>
        <clipPath id="mouthClip"><ellipse cx="200" cy="254" rx="26" ry="20" /></clipPath>
      </defs>

      <ellipse cx="200" cy="250" rx="170" ry="210" fill="var(--sky-bloom)" opacity="0.2" filter="url(#soft)" />

      <g ref={stage}>
        {/* ================= back hair ================= */}
        <g ref={hairBackG}>
          <path
            d="M200 92 C132 92 96 150 96 232 C96 304 108 372 122 424 L278 424
               C292 372 304 304 304 232 C304 150 268 92 200 92 Z"
            fill="url(#hairBackGrad)"
          />
        </g>

        <g ref={bodyG}>
          <g ref={torso}>
            {/* ---- neck ---- */}
            <g ref={neck}>
              <path d="M181 288 h38 v34 c0 15 -38 15 -38 0 z" fill="#f2c6b4" />
              <path d="M182 296 c10 12 26 12 36 0" stroke="#e3ab98" strokeWidth="3" fill="none" opacity="0.7" />
            </g>

            <g ref={shoulders}>
              {/* ---- inner top ---- */}
              <path
                d="M200 316 C232 316 258 332 274 356 C288 378 296 420 300 520 L100 520
                   C104 420 112 378 126 356 C142 332 168 316 200 316 Z"
                fill="url(#inner)"
              />
              <path d="M168 332 C182 352 218 352 232 332" stroke="#c7d4e0" strokeWidth="3" fill="none" />

              {/* ---- arms (upper + fore + hand, independently rigged) ---- */}
              <g ref={armLG}>
                <path d="M112 372 C96 398 86 418 82 434" stroke="#eec03a" strokeWidth="30" strokeLinecap="round" fill="none" />
                <g ref={foreArmL}>
                  <path d="M82 434 C74 456 66 470 60 480" stroke="#eec03a" strokeWidth="27" strokeLinecap="round" fill="none" />
                  <g ref={handL}>
                    <path d="M-6 -12 C10 -20 28 -13 32 0 C36 13 25 24 10 24 C-6 24 -16 13 -14 2 Z" fill="url(#skin)" />
                    <path d="M2 -7 C11 -9 20 -4 24 3" stroke="#e7b6a3" strokeWidth="2" fill="none" />
                    <path d="M0 5 C9 3 18 7 22 13" stroke="#e7b6a3" strokeWidth="2" fill="none" />
                  </g>
                </g>
              </g>

              <g ref={armRG}>
                <path d="M288 372 C304 398 314 418 318 434" stroke="#eec03a" strokeWidth="30" strokeLinecap="round" fill="none" />
                <g ref={foreArmR}>
                  <path d="M318 434 C326 456 334 470 340 480" stroke="#eec03a" strokeWidth="27" strokeLinecap="round" fill="none" />
                  <g ref={handR}>
                    <path d="M-6 -12 C10 -20 28 -13 32 0 C36 13 25 24 10 24 C-6 24 -16 13 -14 2 Z" fill="url(#skin)" />
                    <path d="M2 -7 C11 -9 20 -4 24 3" stroke="#e7b6a3" strokeWidth="2" fill="none" />
                    <path d="M0 5 C9 3 18 7 22 13" stroke="#e7b6a3" strokeWidth="2" fill="none" />
                  </g>
                </g>
              </g>

              {/* ---- cardigan (drawn over the shoulders) ---- */}
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
              <path d="M166 372 C160 424 158 472 162 520" stroke="#c99a1f" strokeWidth="3" fill="none" opacity="0.6" />
              <path d="M234 372 C240 424 242 472 238 520" stroke="#c99a1f" strokeWidth="3" fill="none" opacity="0.6" />
            </g>
          </g>
        </g>

        {/* ================= head ================= */}
        <g ref={headG}>
          <g ref={faceG}>
            <path
              d="M200 108 C142 108 118 152 118 202 C118 252 146 296 200 308 C254 296 282 252 282 202 C282 152 258 108 200 108 Z"
              fill="url(#skin)"
            />
            <ellipse cx="119" cy="214" rx="10" ry="16" fill="#f9dccf" />
            <ellipse cx="281" cy="214" rx="10" ry="16" fill="#f9dccf" />

            <g ref={blushG} opacity="0.5">
              <ellipse cx="141" cy="242" rx="26" ry="13" fill="url(#blushGrad)" />
              <ellipse cx="259" cy="242" rx="26" ry="13" fill="url(#blushGrad)" />
            </g>

            {/* ---- eyes ---- */}
            <ellipse cx="152" cy="208" rx="25" ry="28" fill="#ffffff" />
            <ellipse cx="248" cy="208" rx="25" ry="28" fill="#ffffff" />

            <g clipPath="url(#eyeClipL)">
              <g ref={irisL}>
                <ellipse cx="152" cy="209" rx="18" ry="22" fill="url(#irisGrad)" />
                <ellipse ref={pupilL} cx="152" cy="213" rx="8.5" ry="10.5" fill="#1b1d24" opacity="0.85" />
                <ellipse cx="152" cy="223" rx="13" ry="7" fill="#e6e9ee" opacity="0.35" />
                <circle cx="145" cy="199" r="6.6" fill="#ffffff" opacity="0.98" />
                <circle cx="160" cy="217" r="3.4" fill="#ffffff" opacity="0.8" />
              </g>
              <ellipse cx="152" cy="184" rx="26" ry="12" fill="#4a4f5c" opacity="0.28" />
              <g ref={lowLidL}>
                <ellipse cx="152" cy="243" rx="26" ry="9" fill="#ffe6d8" />
              </g>
            </g>
            <g clipPath="url(#eyeClipR)">
              <g ref={irisR}>
                <ellipse cx="248" cy="209" rx="18" ry="22" fill="url(#irisGrad)" />
                <ellipse ref={pupilR} cx="248" cy="213" rx="8.5" ry="10.5" fill="#1b1d24" opacity="0.85" />
                <ellipse cx="248" cy="223" rx="13" ry="7" fill="#e6e9ee" opacity="0.35" />
                <circle cx="241" cy="199" r="6.6" fill="#ffffff" opacity="0.98" />
                <circle cx="256" cy="217" r="3.4" fill="#ffffff" opacity="0.8" />
              </g>
              <ellipse cx="248" cy="184" rx="26" ry="12" fill="#4a4f5c" opacity="0.28" />
              <g ref={lowLidR}>
                <ellipse cx="248" cy="243" rx="26" ry="9" fill="#ffe6d8" />
              </g>
            </g>

            {/* ---- lids (scale to blink) ---- */}
            <g ref={lidL}>
              <path d="M127 208 a25 30 0 0 1 50 0 v-34 h-50 z" fill="url(#skin)" />
              <path d="M127 206 a25 26 0 0 1 50 0" stroke="#3a3f4d" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            </g>
            <g ref={lidR}>
              <path d="M223 208 a25 30 0 0 1 50 0 v-34 h-50 z" fill="url(#skin)" />
              <path d="M223 206 a25 26 0 0 1 50 0" stroke="#3a3f4d" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            </g>

            {/* ---- eyebrows ---- */}
            <g ref={browL}>
              <path d="M134 174 C143 168 162 168 171 173" stroke="#2a2e42" strokeWidth="5.5" strokeLinecap="round" fill="none" />
            </g>
            <g ref={browR}>
              <path d="M229 173 C238 168 257 168 266 174" stroke="#2a2e42" strokeWidth="5.5" strokeLinecap="round" fill="none" />
            </g>

            {/* ---- nose ---- */}
            <path d="M200 228 c3 6 2 9 -3 10" stroke="#e5b6a4" strokeWidth="2.5" fill="none" strokeLinecap="round" />

            {/* ---- mouth: inner cavity, tongue, teeth, lips ---- */}
            <g ref={mouthG}>
              <g clipPath="url(#mouthClip)">
                <path ref={mouthInner} d="M187 252 Q200 249 213 252 Q200 254 187 252 Z" fill="#7d2f3c" />
                <ellipse ref={tongue} cx="200" cy="258" rx="8" ry="3" fill="#e3697a" opacity="0" />
                <path ref={teeth} d="M190 252 h20 v3 h-20 Z" fill="#fffaf6" opacity="0" />
              </g>
              <path ref={upperLip} d="M186 251 Q200 248 214 251" stroke="#d98d8d" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path ref={mouthLine} d="M187 252 Q200 256 213 252" stroke="#c4707a" strokeWidth="3" fill="none" strokeLinecap="round" />
            </g>
          </g>

          {/* ---- side hair ---- */}
          <g ref={hairSideL}>
            <path
              d="M132 118 C104 146 96 210 102 272 C106 310 114 336 122 356
                 C118 316 116 274 122 236 C128 194 136 152 162 126 Z"
              fill="url(#hairGrad)"
            />
          </g>
          <g ref={hairSideR}>
            <path
              d="M268 118 C296 146 304 210 298 272 C294 310 286 336 278 356
                 C282 316 284 274 278 236 C272 194 264 152 238 126 Z"
              fill="url(#hairGrad)"
            />
          </g>

          {/* ---- bangs ---- */}
          <g ref={bangs}>
            <path
              d="M200 92 C150 92 120 128 118 176 C130 152 148 138 168 134
                 C160 148 158 160 160 170 C170 148 188 136 206 134
                 C200 146 198 158 200 168 C212 146 232 136 250 140
                 C246 150 246 158 250 166 C262 150 274 154 282 176
                 C282 126 252 92 200 92 Z"
              fill="url(#hairGrad)"
            />
            <path d="M172 108 C196 100 224 102 244 114" stroke="#3a4160" strokeWidth="4" fill="none" opacity="0.5" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}
