import { useAuraStore } from "@/lib/aura/store";

/**
 * Speech-synchronised captions: the spoken word scales up, gains a purple
 * highlight and a soft glow, then smoothly hands off to the next word.
 */
export function Subtitles() {
  const caption = useAuraStore((s) => s.caption);
  const active = useAuraStore((s) => s.captionWord);

  if (!caption.trim()) return null;
  const words = caption.trim().split(/\s+/);
  const current = Math.min(active, words.length - 1);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[7.5rem] z-20 flex justify-center px-4 md:bottom-[8.5rem]">
      <p className="flex max-w-[min(92vw,860px)] flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xl font-extrabold uppercase tracking-wide text-foreground drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)] md:text-3xl">
        {words.map((word, index) => {
          const isActive = index === current;
          const isSpoken = index < current;
          return (
            <span
              key={`${word}-${index}`}
              className="inline-block origin-bottom rounded-md px-1.5 transition-all duration-150 ease-out will-change-transform"
              style={
                isActive
                  ? {
                      transform: "scale(1.14) translateY(-2px)",
                      backgroundColor: "hsl(var(--primary))",
                      color: "hsl(var(--primary-foreground))",
                      boxShadow: "0 0 26px hsl(var(--primary) / 0.75)",
                    }
                  : {
                      transform: "scale(1)",
                      opacity: isSpoken ? 0.95 : 0.7,
                    }
              }
            >
              {word}
            </span>
          );
        })}
      </p>
    </div>
  );
}
