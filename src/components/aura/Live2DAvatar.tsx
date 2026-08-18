import { useEffect, useRef, useState } from "react";

import { rig } from "@/lib/aura/rig/rig";
import { applyPose, type CoreModelLike } from "@/lib/aura/live2d/params";
import { loadCubismCore, MODEL_URL } from "@/lib/aura/live2d/loader";

/**
 * Pixi + Cubism 4 renderer. Client-only: everything browser-bound is imported
 * dynamically inside the effect so SSR never touches pixi or the Live2D core.
 * The rig stays the single source of truth — this loop only writes parameters.
 */
export default function Live2DAvatar({ onFail }: { onFail?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    (async () => {
      try {
        await loadCubismCore();
        const PIXI = await import("pixi.js");
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        // pixi-live2d-display needs the ticker/loader on the global PIXI.
        (window as unknown as { PIXI: unknown }).PIXI = PIXI;
        Live2DModel.registerTicker(PIXI.Ticker);

        if (disposed || !host.current) return;

        const app = new PIXI.Application({
          resizeTo: host.current,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
        host.current.appendChild(app.view as unknown as HTMLCanvasElement);

        const model = await Live2DModel.from(MODEL_URL, { autoInteract: false });
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }

        // Model drives its own params; stop the built-in motion managers so the
        // rig is not fighting idle motions.
        model.autoUpdate = true;
        app.stage.addChild(model as unknown as import("pixi.js").DisplayObject);

        const layout = () => {
          const w = app.renderer.width / app.renderer.resolution;
          const h = app.renderer.height / app.renderer.resolution;
          const scale = Math.min(w / model.width, h / model.height) * 1.05;
          model.scale.set(scale);
          model.anchor?.set?.(0.5, 0.5);
          model.position.set(w / 2, h / 2);
        };
        layout();
        const ro = new ResizeObserver(layout);
        if (host.current) ro.observe(host.current);

        const core = (model.internalModel as unknown as { coreModel: CoreModelLike })
          .coreModel;

        const tick = () => {
          raf = requestAnimationFrame(tick);
          applyPose(core, rig.pose);
        };
        raf = requestAnimationFrame(tick);
        setReady(true);

        cleanup = () => {
          ro.disconnect();
          cancelAnimationFrame(raf);
          app.destroy(true, { children: true });
        };
      } catch (error) {
        console.warn("[aura] Live2D unavailable, using SVG rig:", error);
        if (!disposed) onFail?.();
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, [onFail]);

  return (
    <div
      ref={host}
      className="h-full w-full"
      data-live2d-ready={ready ? "1" : "0"}
      aria-hidden
    />
  );
}