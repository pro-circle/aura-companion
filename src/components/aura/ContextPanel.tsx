import { useAuraStore } from "@/lib/aura/store";

const ROWS: Array<{ label: string; value: (ctx: ReturnType<typeof useAuraStore.getState>["context"]) => string }> = [
  { label: "Time", value: (c) => `${c.local_time ?? "--:--"} · ${c.day_part ?? "unknown"}` },
  {
    label: "Presence",
    value: (c) => (c.people ? `${c.people} person${c.people > 1 ? "s" : ""} visible` : "no one detected"),
  },
  { label: "Attention", value: (c) => (c.face_present ? "looking at AURA" : "away / camera off") },
  { label: "Mood read", value: (c) => c.user_emotion },
  {
    label: "Lighting",
    value: (c) =>
      c.luminance === null ? "camera off" : c.luminance < 0.35 ? "dim" : "bright",
  },
  { label: "Mic", value: (c) => c.mic_state ?? "idle" },
];

export function ContextPanel() {
  const context = useAuraStore((s) => s.context);

  return (
    <section className="aura-panel rounded-2xl p-5" aria-label="Context awareness">
      <h2 className="font-display text-sm font-semibold tracking-wide text-foreground">
        Context engine
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Derived on-device. Raw camera and audio never leave this browser.
      </p>

      <dl className="mt-4 space-y-2.5">
        {ROWS.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {row.label}
            </dt>
            <dd className="text-right text-xs text-foreground">{row.value(context)}</dd>
          </div>
        ))}
      </dl>

      {context.scene_tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {context.scene_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
