import { ContextPanel } from "@/components/aura/ContextPanel";
import { PoolStatusPanel } from "@/components/aura/PoolStatusPanel";
import { PrivacyPanel } from "@/components/aura/PrivacyPanel";
import { useAuraStore } from "@/lib/aura/store";

const ICONS = [
  <path key="ctx" d="M12 3a9 9 0 1 0 9 9h-9V3Z" />,
  <path
    key="mic"
    d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-6 6.93V21h-2v-3.07A7 7 0 0 1 5 11h2a5 5 0 0 0 10 0h2Z"
  />,
  <path key="pool" d="M4 6h16v4H4V6Zm0 8h16v4H4v-4Z" />,
];

/**
 * Supabase-style rail: a slim icon strip that expands on hover
 * (or keyboard focus) and retracts when the pointer leaves.
 * Purely CSS-driven so it never desyncs from the pointer.
 */
export function SideDock() {
  const connection = useAuraStore((s) => s.connection);
  const avatarState = useAuraStore((s) => s.avatarState);

  return (
    <aside
      aria-label="AURA systems"
      className="group absolute inset-y-0 left-0 z-30 flex w-14 transition-[width] duration-300 ease-out hover:w-[19rem] focus-within:w-[19rem]"
    >
      <div className="aura-rail flex h-full w-full flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-3 px-4">
          <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connection === "connected" ? "animate-aura-pulse bg-emerald-400" : "bg-amber-400"
              }`}
            />
          </span>
          <span className="whitespace-nowrap font-display text-sm font-semibold text-[color:var(--sky-ink)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            AURA · {avatarState}
          </span>
        </div>

        {/* collapsed icon hints */}
        <div className="flex flex-col items-center gap-5 pt-3 opacity-70 transition-opacity duration-200 group-hover:pointer-events-none group-hover:absolute group-hover:opacity-0 group-focus-within:opacity-0">
          {ICONS.map((icon, index) => (
            <svg
              key={index}
              viewBox="0 0 24 24"
              className="h-5 w-5 fill-[color:var(--sky-sub-ink)]"
              aria-hidden="true"
            >
              {icon}
            </svg>
          ))}
        </div>

        <div className="aura-scroll aura-fade-top pointer-events-none min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <ContextPanel />
          <PrivacyPanel />
          <PoolStatusPanel />
        </div>
      </div>
    </aside>
  );
}
