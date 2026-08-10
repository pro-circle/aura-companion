import { useEffect, useRef } from "react";

import { useAuraStore } from "@/lib/aura/store";
import { analyzeFrame, dayPart } from "@/lib/aura/vision";
import type { SceneContext } from "@/lib/aura/types";

/**
 * Local sensor loop: clock + camera scene analysis.
 * Runs entirely client-side and pushes only derived context to the backend.
 */
export function useSensors(sendContext: (context: SceneContext) => void) {
  const cameraOn = useAuraStore((s) => s.privacy.camera);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Clock + day part, always on.
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      useAuraStore.getState().patchContext({
        local_time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        day_part: dayPart(now.getHours()),
      });
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  // Camera: local frame analysis only.
  useEffect(() => {
    if (!cameraOn) {
      useAuraStore.getState().patchContext({
        people: 0,
        face_present: false,
        luminance: null,
        scene_tags: [],
      });
      return;
    }

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
      } catch {
        useAuraStore.getState().setError("Camera permission denied.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current ?? document.createElement("video");
      videoRef.current = video;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play().catch(() => undefined);

      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;

      timer = setInterval(async () => {
        const analysis = await analyzeFrame(video, canvas);
        if (!analysis) return;
        const store = useAuraStore.getState();
        store.patchContext(analysis);
        sendContext({ ...store.context, ...analysis });
      }, 2000);
    };

    void start();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOn, sendContext]);

  return { videoRef, canvasRef };
}
