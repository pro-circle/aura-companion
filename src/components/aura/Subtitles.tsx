import { useAuraStore } from "@/lib/aura/store";

/**
 * Cinematic burned-in captions: the avatar's speech, word-by-word,
 * with the active word boxed like a reel caption.
 */
export function Subtitles() {
  const caption = useAuraStore((s) => s.caption);
  const active = useAuraStore((s) => s.captionWord);

  if (!caption.trim()) return null;
  const words = caption.trim().split(/\s+/);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[7.5rem] z-20 flex justify-center px-4 md:bottom-[8.5rem]">
      <p className="flex max-w-[min(92vw,860px)] flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xl font-extrabold uppercase tracking-wide text-foreground drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)] md:text-3xl">
        {words.map((word, index) => {
          const isActive = index === Math.min(active, words.length - 1);
          return (
            <span
              key={`${word}-${index}`}
              className={
                isActive
                  ? "rounded-md bg-primary px-1.5 text-primary-foreground transition-colors duration-100"
                  : "transition-colors duration-150"
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
