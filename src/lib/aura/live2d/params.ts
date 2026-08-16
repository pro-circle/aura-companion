import type { RigPose } from "../rig/rig";
import { clamp } from "../rig/math";

/**
 * RigPose -> Cubism 4 parameter mapping.
 *
 * The rig stays the single source of truth for behaviour; this file is the
 * only place that knows Live2D parameter ids, so a differently-rigged model
 * can be supported by editing this map alone.
 */

export interface CoreModelLike {
  setParameterValueById(id: string, value: number, weight?: number): void;
}

export const PARAM = {
  angleX: "ParamAngleX",
  angleY: "ParamAngleY",
  angleZ: "ParamAngleZ",
  eyeLOpen: "ParamEyeLOpen",
  eyeROpen: "ParamEyeROpen",
  eyeBallX: "ParamEyeBallX",
  eyeBallY: "ParamEyeBallY",
  eyeLSmile: "ParamEyeLSmile",
  eyeRSmile: "ParamEyeRSmile",
  browLY: "ParamBrowLY",
  browRY: "ParamBrowRY",
  browLAngle: "ParamBrowLAngle",
  browRAngle: "ParamBrowRAngle",
  browLForm: "ParamBrowLForm",
  browRForm: "ParamBrowRForm",
  mouthOpenY: "ParamMouthOpenY",
  mouthForm: "ParamMouthForm",
  cheek: "ParamCheek",
  bodyAngleX: "ParamBodyAngleX",
  bodyAngleY: "ParamBodyAngleY",
  bodyAngleZ: "ParamBodyAngleZ",
  breath: "ParamBreath",
  armLA: "ParamArmLA",
  armRA: "ParamArmRA",
  hairFront: "ParamHairFront",
  hairSide: "ParamHairSide",
  hairBack: "ParamHairBack",
} as const;

/** Head turn in rig units is roughly ±8; Live2D angles run ±30. */
const HEAD_GAIN = 3.4;

export function applyPose(core: CoreModelLike, p: RigPose) {
  const set = (id: string, v: number) => core.setParameterValueById(id, v);

  // head
  set(PARAM.angleX, clamp(p.headTurn * HEAD_GAIN, -30, 30));
  set(PARAM.angleY, clamp(-p.headNod * 3 + p.gazeY * 6, -30, 30));
  set(PARAM.angleZ, clamp(p.headTilt * 2.2, -30, 30));

  // eyes
  set(PARAM.eyeLOpen, clamp(p.eyeOpenL, 0, 2));
  set(PARAM.eyeROpen, clamp(p.eyeOpenR, 0, 2));
  set(PARAM.eyeBallX, clamp(p.gazeX, -1, 1));
  set(PARAM.eyeBallY, clamp(-p.gazeY, -1, 1));
  const eyeSmile = clamp(Math.max(0, p.smile) * 0.8 + p.squint * 0.5, 0, 1);
  set(PARAM.eyeLSmile, eyeSmile);
  set(PARAM.eyeRSmile, eyeSmile);

  // brows — rig browY is px (down positive), Live2D wants -1..1 (up positive)
  const browY = clamp(-p.browY / 6, -1, 1);
  set(PARAM.browLY, browY);
  set(PARAM.browRY, browY);
  set(PARAM.browLAngle, clamp(p.browL, -1, 1));
  set(PARAM.browRAngle, clamp(-p.browR, -1, 1));
  const browForm = clamp(p.browInner * 0.8 + Math.max(0, p.smile) * 0.3, -1, 1);
  set(PARAM.browLForm, browForm);
  set(PARAM.browRForm, browForm);

  // mouth
  set(PARAM.mouthOpenY, clamp(p.mouth.open, 0, 1));
  set(PARAM.mouthForm, clamp(p.mouth.wide * 0.7 - p.mouth.round * 0.9 + p.smile * 0.5, -1, 1));
  set(PARAM.cheek, clamp(p.blush, 0, 1));

  // body
  set(PARAM.bodyAngleX, clamp(p.headTurn * 1.6 + p.bodySway * 1.2, -10, 10));
  set(PARAM.bodyAngleY, clamp(p.lean * 6 - p.breath * 0.6, -10, 10));
  set(PARAM.bodyAngleZ, clamp(p.headTilt * 0.8, -10, 10));
  set(PARAM.breath, clamp((p.breath + 2) / 4, 0, 1));

  // arms (optional on most models — harmless if the ids are absent)
  set(PARAM.armLA, clamp(p.arms.upperL / 45, -1, 1));
  set(PARAM.armRA, clamp(p.arms.upperR / 45, -1, 1));

  // hair physics: the rig already computes lag, so drive it directly
  set(PARAM.hairFront, clamp(p.hairBangs / 6, -1, 1));
  set(PARAM.hairSide, clamp(p.hairLag / 6, -1, 1));
  set(PARAM.hairBack, clamp(p.hairBack / 6, -1, 1));
}