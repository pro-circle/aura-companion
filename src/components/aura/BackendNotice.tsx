import { useAuraStore } from "@/lib/aura/store";
import { BACKEND_URL } from "@/lib/aura/types";

export function BackendNotice() {
  const connection = useAuraStore((s) => s.connection);
  const lastError = useAuraStore((s) => s.lastError);

  if (connection === "connected" && !lastError) return null;

  return (
    <div className="mx-5 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-foreground md:mx-8">
      {lastError ? (
        <p>{lastError}</p>
      ) : (
        <p>
          Running on AURA&apos;s built-in brain — your FastAPI backend at{" "}
          <code className="font-mono text-primary">{BACKEND_URL}</code> isn&apos;t up. Start it with{" "}
          <code className="font-mono text-primary">
            cd backend &amp;&amp; uvicorn app.main:app --reload --port 8000
          </code>{" "}
          to use your own key pool.
        </p>
      )}
    </div>
  );
}
