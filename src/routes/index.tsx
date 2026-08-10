import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useRef, useState } from "react";

import { BackendNotice } from "@/components/aura/BackendNotice";
import { ChatDock } from "@/components/aura/ChatDock";
import { SideDock } from "@/components/aura/SideDock";
import { Subtitles } from "@/components/aura/Subtitles";
import { useAuraConnection } from "@/lib/aura/socket";
import { useCameraRig } from "@/lib/aura/useCamera";
import { useDemoMode } from "@/lib/aura/useDemoMode";
import { themeForHour, themeVars, type DayTheme } from "@/lib/aura/theme";
import { useSensors } from "@/lib/aura/useSensors";
import { useCursorMood } from "@/lib/aura/useCursorMood";

const AnimeAvatar = lazy(() => import("@/components/aura/AnimeAvatar"));

const TITLE = "AURA — Your Anime AI Friend Who Sees the Room";
const DESCRIPTION =
  "A living anime companion that blinks, emotes, lip-syncs and jokes with you in real time. Voice in, voice out, streaming only — no database.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuraPage,
});

function useDayTheme(): DayTheme {
  // Deterministic first paint (server + client agree), then the real hour.
  const [theme, setTheme] = useState<DayTheme>(() => themeForHour(12));
  useEffect(() => {
    const update = () => setTheme(themeForHour(new Date().getHours()));
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);
  return theme;
}

function AuraPage() {
  const { sendMessage, sendContext, clearSession } = useAuraConnection();
  useSensors(sendContext);
  useCursorMood();
  useDemoMode();
  const theme = useDayTheme();
  const cameraTarget = useRef<HTMLDivElement>(null);
  useCameraRig(cameraTarget);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main
      className="aura-sky relative h-screen w-full overflow-hidden"
      style={themeVars(theme)}
      data-daypart={theme.key}
    >
      {/* atmosphere */}
      <div className="aura-sun pointer-events-none absolute inset-0" />
      {theme.stars && <div className="aura-stars pointer-events-none absolute inset-0" />}
      <div className="aura-breeze pointer-events-none absolute inset-0" />

      {/* avatar fills the view */}
      <div className="absolute inset-0 flex items-end justify-center pb-[9rem] md:pb-[9.5rem]">
        <div
          ref={cameraTarget}
          className="h-[80vh] w-full max-w-[min(94vw,720px)] will-change-transform"
          style={{ transformOrigin: "50% 38%" }}
        >

          {mounted && (
            <Suspense fallback={null}>
              <AnimeAvatar />
            </Suspense>
          )}
        </div>
      </div>

      <SideDock />

      <Subtitles />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3">
        <BackendNotice />
      </div>

      <ChatDock onSend={sendMessage} onClear={clearSession} />
    </main>
  );
}
