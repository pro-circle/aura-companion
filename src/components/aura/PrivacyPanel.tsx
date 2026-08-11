import { useEffect, useState } from "react";

import { useAuraStore, type PrivacySettings } from "@/lib/aura/store";
import { onEngineChange } from "@/lib/aura/voice/engine";

const TOGGLES: Array<{ key: keyof PrivacySettings; label: string; hint: string }> = [
  { key: "camera", label: "Camera", hint: "Local scene analysis only" },
  { key: "microphone", label: "Microphone", hint: "Browser speech recognition" },
  { key: "voice", label: "AURA's voice", hint: "Loading local neural voice…" },
  { key: "onDeviceOnly", label: "On-device media only", hint: "Never upload frames or audio" },
];

export function PrivacyPanel() {
  const privacy = useAuraStore((s) => s.privacy);
  const togglePrivacy = useAuraStore((s) => s.togglePrivacy);
  // Kokoro downloads in the background; show which voice is actually live.
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  useEffect(() => onEngineChange((engine) => setVoiceHint(`${engine.label} · free`)), []);

  return (
    <section className="aura-panel rounded-2xl p-5" aria-label="Privacy controls">
      <h2 className="font-display text-sm font-semibold tracking-wide text-foreground">
        Sensors &amp; privacy
      </h2>

      <ul className="mt-4 space-y-3">
        {TOGGLES.map((toggle) => {
          const active = privacy[toggle.key];
          return (
            <li key={toggle.key} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-foreground">{toggle.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {toggle.key === "voice" && voiceHint ? voiceHint : toggle.hint}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={toggle.label}
                onClick={() => togglePrivacy(toggle.key)}
                className={
                  active
                    ? "relative h-5 w-9 shrink-0 rounded-full bg-primary transition-colors"
                    : "relative h-5 w-9 shrink-0 rounded-full bg-secondary transition-colors"
                }
              >
                <span
                  className={
                    active
                      ? "absolute left-[18px] top-0.5 h-4 w-4 rounded-full bg-primary-foreground transition-all"
                      : "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-muted-foreground transition-all"
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
