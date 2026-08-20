import { useEffect, useRef } from "react";

import bodyArt from "@/assets/character/parts/body.png";
import headArt from "@/assets/character/parts/head.png";
import { useAuraStore } from "@/lib/aura/store";
import { clamp } from "@/lib/aura/rig/math";
import { rig } from "@/lib/aura/rig/rig";

/**
 * Cutout-puppet renderer: the original character-sheet artwork cut into head
 * and body layers, animated live by the same `rig` pose that drives every
 * other renderer. Eyes (blink) and mouth (visemes) are vector overlays
 * calibrated to the painted face, so lip sync and blinking read as part of
 * the drawing rather than an effect on top of it.
 *
 * Coordinate system = the 1000x1450 stage used to calibrate the art:
 *   head art  drawn at (229, 166) scaled 0.625 — the painted neck tucks
 *   behind the cardigan collar so no seam is visible
 *   body art  drawn at (100, 500) scale 1
 */

const HEAD_X = 229;
const HEAD_Y = 166;
const HEAD_K = 0.625;
/** head-art local point -> stage point */
const hx = (x: number) => HEAD_X + x * HEAD_K;
const hy = (y: number) => HEAD_Y + y * HEAD_K;

const EYE_L = { x: hx(330), y: hy(410) };
const EYE_R = { x: hx(545), y: hy(410) };
const EYE_RX = 40;
const EYE_RY = 26;
const MOUTH = { x: hx(457), y: hy(572) };
const NECK = { x: 502, y: 566 };

const SKIN = "#fadcc0";
const SKIN_SHADE = "#eec6a6";
const LASH = "#241f2b";
const LIP = "#c4756e";

export default function PuppetAvatar() {
  const avatarState = useAuraStore((s) => s.avatarState);
  const emotion = useAuraStore((s) => s.emotion);

  const stage = useRef<SVGGElement>(null);
  const bodyG = useRef<SVGGElement>(null);
  const headG = useRef<SVGGElement>(null);
  const lidL = useRef<SVGGElement>(null);
  const lidR = useRef<SVGGElement>(null);
  const squintL = useRef<SVGGElement>(null);
  const squintR = useRef<SVGGElement>(null);
  const mouthG = useRef<SVGGElement>(null);
  const mouthInner = useRef<SVGPathElement>(null);
  const mouthLine = useRef<SVGPathElement>(null);
  const teeth = useRef<SVGPathElement>(null);
  const tongue = useRef<SVGEllipseElement>(null);
  const blush = useRef<SVGGElement>(null);

  useEffect(() => { rig.setState(avatarState); }, [avatarState]);
  useEffect(() => { rig.setEmotion(emotion, 0.85); }, [emotion]);

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
    const set = (el: Element | null, attr: string, value: string) => el?.setAttribute(attr, value);

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = rig.update(dt);

      /* stage: lean pushes her toward the lens */
      const zoom = 1 + p.lean * 0.035;
      set(stage.current, "transform",
        `translate(500 500) scale(${zoom.toFixed(4)}) translate(-500 -500) ` +
        `translate(${(p.bodySway * 1.6).toFixed(2)} ${(-p.lean * 14).toFixed(2)})`);

      /* body: breath + sway + a faint counter-rotation against the head */
      set(bodyG.current, "transform",
        `translate(${(p.bodySway * 1.2).toFixed(2)} ${(p.breath * 2.2 - p.shoulder * 1.4).toFixed(2)}) ` +
        `rotate(${(p.headTilt * 0.14).toFixed(3)} ${NECK.x} 900) ` +
        `scale(1 ${(1 + p.breath * 0.004).toFixed(4)})`);

      /* head: rotates around the neck joint, pushes in/out with intent */
      set(headG.current, "transform",
        `translate(${NECK.x} ${NECK.y}) ` +
        `rotate(${(p.headTilt * 0.8).toFixed(3)}) ` +
        `scale(${(1 + p.headPush * 0.022).toFixed(4)}) ` +
        `translate(${(p.headTurn * 4.2 + p.hairLag * 0.6).toFixed(2)} ${(p.headNod * 2.4 + p.breath * 1.2).toFixed(2)}) ` +
        `translate(${-NECK.x} ${-NECK.y})`);

      /* blink: the skin lid sweeps down over the painted eye */
      const lid = (el: Element | null, open: number) =>
        set(el, "transform", `translate(0 ${(-(EYE_RY * 2 + 2) * clamp(open, 0, 1)).toFixed(2)})`);
      lid(lidL.current, p.eyeOpenL);
      lid(lidR.current, p.eyeOpenR);
      const sq = (p.squint * EYE_RY * 0.55).toFixed(2);
      set(squintL.current, "transform", `translate(0 ${-sq})`);
      set(squintR.current, "transform", `translate(0 ${-sq})`);

      /* mouth visemes */
      const m = p.mouth;
      const openPx = m.open * 34;
      const width = 26 + m.wide * 20 - m.round * 11 - m.press * 4;
      const cy = MOUTH.y + m.open * 4;
      const lift = p.smile * 7;

      set(mouthG.current, "transform",
        `translate(${(p.headTurn * 0.9).toFixed(2)} ${(m.press * -1).toFixed(2)})`);
      set(mouthInner.current, "d",
        `M${(MOUTH.x - width).toFixed(1)} ${cy.toFixed(1)} ` +
        `Q${MOUTH.x} ${(cy - 5 - lift * 0.5).toFixed(1)} ${(MOUTH.x + width).toFixed(1)} ${cy.toFixed(1)} ` +
        `Q${MOUTH.x} ${(cy + openPx + 4).toFixed(1)} ${(MOUTH.x - width).toFixed(1)} ${cy.toFixed(1)} Z`);
      set(mouthInner.current, "opacity", (clamp(m.open * 3.2, 0, 1)).toFixed(3));
      set(mouthLine.current, "d",
        `M${(MOUTH.x - width - 3).toFixed(1)} ${(cy - lift * 0.25).toFixed(1)} ` +
        `Q${MOUTH.x} ${(cy + 3 + lift * 0.9 * -1 + m.open * 2).toFixed(1)} ` +
        `${(MOUTH.x + width + 3).toFixed(1)} ${(cy - lift * 0.25).toFixed(1)}`);
      set(teeth.current, "d",
        `M${(MOUTH.x - width * 0.72).toFixed(1)} ${(cy + 1).toFixed(1)} ` +
        `H${(MOUTH.x + width * 0.72).toFixed(1)} v${(3 + m.teeth * 5).toFixed(1)} ` +
        `H${(MOUTH.x - width * 0.72).toFixed(1)} Z`);
      set(teeth.current, "opacity", (m.teeth * clamp(m.open * 4, 0, 1)).toFixed(3));
      set(tongue.current, "cx", MOUTH.x.toFixed(1));
      set(tongue.current, "cy", (cy + openPx * 0.72).toFixed(1));
      set(tongue.current, "rx", (width * 0.6).toFixed(1));
      set(tongue.current, "ry", (openPx * 0.28 + 2).toFixed(1));
      set(tongue.current, "opacity", (m.tongue * clamp(m.open * 3, 0, 1)).toFixed(3));

      set(blush.current, "opacity", (p.blush * 0.5).toFixed(3));

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg
      viewBox="0 0 1000 1330"
      className="h-full w-full"
      preserveAspectRatio="xMidYMax meet"
      aria-label="AURA avatar"
    >
      <defs>
        <clipPath id="pp-eye-l">
          <ellipse cx={EYE_L.x} cy={EYE_L.y} rx={EYE_RX} ry={EYE_RY} />
        </clipPath>
        <clipPath id="pp-eye-r">
          <ellipse cx={EYE_R.x} cy={EYE_R.y} rx={EYE_RX} ry={EYE_RY} />
        </clipPath>
        <radialGradient id="pp-blush" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f2837f" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f2837f" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g ref={stage}>
        {/* head sits behind the body so the collar hides the neck seam */}
        <g ref={headG}>
          <image href={headArt} x={HEAD_X} y={HEAD_Y} width={790 * HEAD_K} height={1004 * HEAD_K} />

          {/* blink lids */}
          <g clipPath="url(#pp-eye-l)">
            <g ref={lidL}>
              <rect x={EYE_L.x - EYE_RX} y={EYE_L.y - EYE_RY - 2} width={EYE_RX * 2} height={EYE_RY * 2 + 4} fill={SKIN} />
              <rect x={EYE_L.x - EYE_RX} y={EYE_L.y + EYE_RY - 1} width={EYE_RX * 2} height="4" fill={LASH} />
            </g>
            <g ref={squintL}>
              <rect x={EYE_L.x - EYE_RX} y={EYE_L.y + EYE_RY * 0.85} width={EYE_RX * 2} height={EYE_RY} fill={SKIN} />
            </g>
          </g>
          <g clipPath="url(#pp-eye-r)">
            <g ref={lidR}>
              <rect x={EYE_R.x - EYE_RX} y={EYE_R.y - EYE_RY - 2} width={EYE_RX * 2} height={EYE_RY * 2 + 4} fill={SKIN} />
              <rect x={EYE_R.x - EYE_RX} y={EYE_R.y + EYE_RY - 1} width={EYE_RX * 2} height="4" fill={LASH} />
            </g>
            <g ref={squintR}>
              <rect x={EYE_R.x - EYE_RX} y={EYE_R.y + EYE_RY * 0.85} width={EYE_RX * 2} height={EYE_RY} fill={SKIN} />
            </g>
          </g>

          {/* blush */}
          <g ref={blush} opacity="0.25">
            <ellipse cx={EYE_L.x - 4} cy={EYE_L.y + 34} rx="34" ry="17" fill="url(#pp-blush)" />
            <ellipse cx={EYE_R.x + 4} cy={EYE_R.y + 34} rx="34" ry="17" fill="url(#pp-blush)" />
          </g>

          {/* mouth: skin patch masks the painted lips, vectors do the talking */}
          <g ref={mouthG}>
            <ellipse cx={MOUTH.x} cy={MOUTH.y} rx="54" ry="30" fill={SKIN} opacity="0.98" />
            <ellipse cx={MOUTH.x} cy={MOUTH.y + 22} rx="46" ry="14" fill={SKIN_SHADE} opacity="0.25" />
            <path ref={mouthInner} d="" fill="#5c2733" opacity="0" />
            <path ref={teeth} d="" fill="#fffaf6" opacity="0" />
            <ellipse ref={tongue} cx={MOUTH.x} cy={MOUTH.y} rx="10" ry="4" fill="#d4776f" opacity="0" />
            <path ref={mouthLine} d="" fill="none" stroke={LIP} strokeWidth="3.2" strokeLinecap="round" />
          </g>
        </g>

        <g ref={bodyG}>
          <image href={bodyArt} x={100} y={500} width={803} height={927} />
        </g>
      </g>
    </svg>
  );
}
