/**
 * Client-only Live2D bootstrap: Cubism Core script + model availability probe.
 * Everything here must run in the browser (no SSR imports).
 */

export const CUBISM_CORE_SRC =
  "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";

export const MODEL_URL: string =
  (import.meta.env["VITE_LIVE2D_MODEL_URL"] as string | undefined) ??
  "/live2d/aura/aura.model3.json";

let corePromise: Promise<void> | null = null;

export function loadCubismCore(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) {
    return Promise.resolve();
  }
  if (corePromise) return corePromise;

  corePromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-live2d-core="1"]`,
    );
    const script = existing ?? document.createElement("script");
    script.dataset["live2dCore"] = "1";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Live2D Cubism Core"));
    if (!existing) {
      script.src = CUBISM_CORE_SRC;
      document.head.appendChild(script);
    }
    // Guard against a silent CDN stall.
    setTimeout(() => reject(new Error("Live2D Cubism Core timed out")), 15000);
  }).catch((error) => {
    corePromise = null;
    throw error;
  });

  return corePromise;
}

/** True when a real .model3.json is actually deployed at MODEL_URL. */
export async function hasLive2DModel(): Promise<boolean> {
  try {
    const res = await fetch(MODEL_URL, { method: "GET", cache: "no-store" });
    if (!res.ok) return false;
    const text = await res.text();
    // A missing file in a SPA often returns index.html with a 200.
    if (!text.trimStart().startsWith("{")) return false;
    const json = JSON.parse(text) as { FileReferences?: { Moc?: string } };
    return Boolean(json.FileReferences?.Moc);
  } catch {
    return false;
  }
}