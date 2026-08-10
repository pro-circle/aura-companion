import { useAuraStore } from "@/lib/aura/store";

export function PoolStatusPanel() {
  const pool = useAuraStore((s) => s.pool);
  const connection = useAuraStore((s) => s.connection);

  return (
    <section className="aura-panel rounded-2xl p-5" aria-label="Inference key pool">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold tracking-wide text-foreground">
          Key pool
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          free tier
        </span>
      </div>

      {!pool && (
        <p className="mt-3 text-xs text-muted-foreground">
          {connection === "connected"
            ? "Waiting for the first inference call…"
            : "Connect the backend to see key health."}
        </p>
      )}

      {pool && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
              <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Groq
              </span>
              <span className="text-foreground">{pool.groq_keys} keys</span>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
              <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                OpenRouter
              </span>
              <span className="text-foreground">{pool.openrouter_keys} keys</span>
            </div>
          </div>

          <ul className="mt-3 space-y-1.5">
            {pool.keys.map((key) => (
              <li
                key={`${key.provider}-${key.key}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={
                      key.healthy
                        ? "h-1.5 w-1.5 rounded-full bg-primary"
                        : "h-1.5 w-1.5 rounded-full bg-destructive"
                    }
                  />
                  <span className="font-mono text-muted-foreground">
                    {key.provider}:{key.key}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {key.healthy
                    ? `${key.requests} req`
                    : `cooling ${key.cooldown_remaining}s`}
                </span>
              </li>
            ))}
          </ul>

          {pool.keys.length === 0 && (
            <p className="mt-3 text-xs text-destructive">
              No keys configured — add your Groq and OpenRouter keys to backend/.env.
            </p>
          )}
        </>
      )}
    </section>
  );
}
