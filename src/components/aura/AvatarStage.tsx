import { Suspense, lazy, useCallback, useEffect, useState } from "react";

import { hasLive2DModel } from "@/lib/aura/live2d/loader";

const AnimeAvatar = lazy(() => import("./AnimeAvatar"));
const Live2DAvatar = lazy(() => import("./Live2DAvatar"));
const PuppetAvatar = lazy(() => import("./PuppetAvatar"));

/**
 * Picks the renderer at runtime: the rigged Live2D model when one is deployed
 * at /live2d/aura/aura.model3.json, otherwise the built-in SVG rig. Both read
 * the same `rig` pose, so behaviour is identical either way.
 */
export default function AvatarStage() {
  const [mode, setMode] = useState<"probing" | "live2d" | "puppet" | "svg">("probing");

  useEffect(() => {
    let alive = true;
    hasLive2DModel()
      .then((found) => alive && setMode(found ? "live2d" : "puppet"))
      .catch(() => alive && setMode("puppet"));
    return () => {
      alive = false;
    };
  }, []);

  const fallBackToSvg = useCallback(() => setMode("puppet"), []);

  if (mode === "probing") return null;

  return (
    <Suspense fallback={null}>
      {mode === "live2d" ? (
        <Live2DAvatar onFail={fallBackToSvg} />
      ) : mode === "puppet" ? (
        <PuppetAvatar />
      ) : (
        <AnimeAvatar />
      )}
    </Suspense>
  );
}