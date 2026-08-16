# AURA — Original Character Sheet (layered source for Live2D)

All artwork here is original and generated for this project. Never substitute
frames from any copyrighted reel.

## Files

| File | Purpose |
| --- | --- |
| `aura-base-front.png` | Canonical front-facing full pose. The single source of truth for proportions, palette and silhouette. |
| `aura-expressions.png` | 16-cell expression grid (neutral, happy, joy, sad, worried, angry, surprised, shy, embarrassed, confused, thinking, sleepy, alert, smug, crying, wink) — maps 1:1 to `EMOTION_POSE` in `src/lib/aura/rig/emotions.ts`. |
| `aura-parts.png` | Separated rig parts: bangs, side hair L/R, back hair, bald head base, eye whites, irises, lids, brows, 8 mouth visemes, torso, arm segments, hands. |

## Design lock

- Hair: dark navy-black (#1b2135 – #2b3350), chin-length bob, straight bangs
- Eyes: soft grey iris, large twin catchlights
- Skin: warm fair (#fbe6d8 base, #f0c6ae shadow)
- Wardrobe: buttery yellow open cardigan (#f2d98a) over white inner top, navy jeans

## Turning this into a rig (PSD → Live2D → app)

1. **Cut layers.** Open `aura-parts.png`, cut each isolated part onto its own
   PSD layer using the naming below. Paint behind every part that gets
   occluded (behind bangs, behind arms, behind the mouth) so nothing tears when
   a parameter moves.

   ```text
   00_bg
   10_hair_back
   20_body_torso
   21_arm_L_upper / 22_arm_L_fore / 23_hand_L
   24_arm_R_upper / 25_arm_R_fore / 26_hand_R
   30_head_base
   31_ear_L / 32_ear_R
   40_eye_white_L / 41_iris_L / 42_lid_upper_L / 43_lid_lower_L
   44_eye_white_R / 45_iris_R / 46_lid_upper_R / 47_lid_lower_R
   50_brow_L / 51_brow_R
   60_mouth_inner / 61_mouth_shape / 62_teeth / 63_tongue
   70_blush / 71_highlight
   80_hair_side_L / 81_hair_side_R
   90_hair_bangs
   ```

2. **Rig in Live2D Cubism (free).** Create these standard parameters — they are
   exactly what the existing rig already computes each frame:

   | Cubism parameter | Fed by `RigPose` |
   | --- | --- |
   | `ParamAngleX` | `headTurn` |
   | `ParamAngleZ` | `headTilt` |
   | `ParamAngleY` | `headNod` |
   | `ParamEyeLOpen` / `ParamEyeROpen` | `eyeOpenL` / `eyeOpenR` |
   | `ParamEyeBallX` / `ParamEyeBallY` | `gazeX` / `gazeY` |
   | `ParamBrowLY` / `ParamBrowRY`, `ParamBrowLAngle` | `browY`, `browL/browR` |
   | `ParamMouthOpenY` / `ParamMouthForm` | `mouth.open` / `mouth.wide - mouth.round` |
   | `ParamBodyAngleX` / `ParamBodyAngleZ` | `bodySway` / `lean` |
   | `ParamBreath` | `breath` |
   | `ParamArmLA` / `ParamArmRA` | `arms.*` |

   Add physics groups for `80/81_hair_side`, `90_hair_bangs` and `10_hair_back`
   so the springs in `rig.ts` are reinforced by Cubism's own secondary motion.

3. **Export** `aura.moc3`, `aura.model3.json`, textures and `aura.physics3.json`
   into `public/live2d/aura/`.

4. **Swap the renderer.** Keep `AvatarRig` untouched; add a Live2D renderer
   component that reads `rig.pose` in its rAF loop and writes the parameter
   table above via `pixi-live2d-display`. The SVG avatar stays as the
   zero-dependency fallback.