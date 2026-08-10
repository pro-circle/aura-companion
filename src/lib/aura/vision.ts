/**
 * Local, on-device scene analysis. Frames are read from a canvas in the browser
 * and never uploaded — only derived tags/counters are sent to the model.
 *
 * Uses the native FaceDetector when available and a mean-luminance heuristic
 * otherwise. MediaPipe Face/Pose Landmarker can drop in here later without
 * changing the context contract.
 */

export interface FrameAnalysis {
  luminance: number;
  face_present: boolean;
  people: number;
  scene_tags: string[];
}

type FaceDetectorLike = { detect: (source: CanvasImageSource) => Promise<unknown[]> };

let detector: FaceDetectorLike | null = null;
let detectorTried = false;

function getDetector(): FaceDetectorLike | null {
  if (detectorTried) return detector;
  detectorTried = true;
  const Ctor = (globalThis as any).FaceDetector;
  if (typeof Ctor === "function") {
    try {
      detector = new Ctor({ fastMode: true, maxDetectedFaces: 4 }) as FaceDetectorLike;
    } catch {
      detector = null;
    }
  }
  return detector;
}

export function meanLuminance(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const { data } = ctx.getImageData(0, 0, w, h);
  let total = 0;
  const step = 4 * 8; // sample every 8th pixel — cheap enough for 30fps
  let count = 0;
  for (let i = 0; i < data.length; i += step) {
    total += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    count += 1;
  }
  return count ? total / count / 255 : 0;
}

export function tagsFromSignals(luminance: number, facePresent: boolean): string[] {
  const tags: string[] = [];
  tags.push(luminance < 0.25 ? "dark room" : luminance > 0.7 ? "bright room" : "indoor lighting");
  if (facePresent) tags.push("person at the camera");
  const hour = new Date().getHours();
  if (hour >= 9 && hour <= 18) tags.push("likely workspace");
  return tags;
}

export async function analyzeFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<FrameAnalysis | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  const w = 192;
  const h = Math.round((video.videoHeight / video.videoWidth) * w);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);

  const luminance = meanLuminance(ctx, w, h);
  let people = 0;
  let facePresent = false;

  const faceDetector = getDetector();
  if (faceDetector) {
    try {
      const faces = await faceDetector.detect(canvas);
      people = faces.length;
      facePresent = faces.length > 0;
    } catch {
      /* detector unavailable for this frame */
    }
  } else {
    // No detector: assume the streaming user is present while the feed is lit.
    facePresent = luminance > 0.08;
    people = facePresent ? 1 : 0;
  }

  return {
    luminance: Number(luminance.toFixed(3)),
    face_present: facePresent,
    people,
    scene_tags: tagsFromSignals(luminance, facePresent),
  };
}

export function dayPart(hour: number): string {
  if (hour < 5) return "late night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}
