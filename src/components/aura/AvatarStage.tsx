import { Suspense, lazy, useCallback, useEffect, useState } from "react";

import { hasLive2DModel } from "@/lib/aura/live2d/loader";

const AnimeAvatar = lazy(() => import("./AnimeAvatar"));
const Live2DAvatar = lazy(() => import("./Live2DAvatar"));

/**
 * Picks the renderer at runtime: the rigged Live2D model when one is deployed
 * at /live2d/aura/aura.model3.json, otherwise the built-in SVG rig. Both read
 * the same `rig` pose, so behaviour is identical either way.
 */
export default function AvatarStage() {
  const [mode, setMode] = useState<"probing" | "live2d" | "svg">("probing");

  useEffect(() => {
    let alive = true;
    hasLive2DModel()
      .then((found) => alive && setMode(found ? "live2d" : "svg"))
      .catch(() => alive && setMode("svg"));
    return () => {
      alive = false;
    };
  }, []);

  const fallBackToSvg = useCallback(() => setMode("svg"), []);

  if (mode === "probing") return null;

  return (
    <Suspense fallback={null}>
      {mode === "live2d" ? <Live2DAvatar onFail={fallBackToSvg} /> : <AnimeAvatar />}
    </Suspense>
  );
}