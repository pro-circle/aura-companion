/**
 * Time-of-day environment. Drives the full-page sky background so the scene
 * feels like the room the user is actually sitting in.
 */

export type DayKey = "dawn" | "morning" | "noon" | "evening" | "dusk" | "night";

export interface DayTheme {
  key: DayKey;
  label: string;
  /** Top -> bottom sky stops. */
  sky: [string, string, string];
  /** Warm/cool light that hits the avatar. */
  light: string;
  /** Ambient bloom behind the character. */
  bloom: string;
  /** Panel/text ink that stays readable on this sky. */
  ink: string;
  subInk: string;
  panel: string;
  stars: boolean;
}

const THEMES: Record<DayKey, DayTheme> = {
  dawn: {
    key: "dawn",
    label: "early morning",
    sky: ["#20304f", "#5c6f9c", "#f0b48a"],
    light: "#ffd7b0",
    bloom: "#ffb98a",
    ink: "#0f1626",
    subInk: "#3a4560",
    panel: "255 255 255",
    stars: false,
  },
  morning: {
    key: "morning",
    label: "morning",
    sky: ["#8ec9f0", "#bfe3f7", "#eaf7f2"],
    light: "#ffffff",
    bloom: "#9fe3ff",
    ink: "#12202e",
    subInk: "#40566a",
    panel: "255 255 255",
    stars: false,
  },
  noon: {
    key: "noon",
    label: "noon",
    sky: ["#4aa8e8", "#87cdf4", "#dff1ff"],
    light: "#ffffff",
    bloom: "#ffffff",
    ink: "#0d1c2b",
    subInk: "#3a5166",
    panel: "255 255 255",
    stars: false,
  },
  evening: {
    key: "evening",
    label: "evening",
    sky: ["#3f4f86", "#e0955c", "#ffd79a"],
    light: "#ffcf94",
    bloom: "#ffb06a",
    ink: "#20140c",
    subInk: "#5a4433",
    panel: "255 248 240",
    stars: false,
  },
  dusk: {
    key: "dusk",
    label: "dusk",
    sky: ["#141c3a", "#4a3a70", "#c2708a"],
    light: "#d8a7ff",
    bloom: "#a97bff",
    ink: "#f4f0ff",
    subInk: "#c3b9dd",
    panel: "24 22 44",
    stars: true,
  },
  night: {
    key: "night",
    label: "night",
    sky: ["#050914", "#0d1730", "#1b2a4d"],
    light: "#9fc4ff",
    bloom: "#6f9bff",
    ink: "#eaf1ff",
    subInk: "#9fb0cf",
    panel: "12 18 34",
    stars: true,
  },
};

export function themeForHour(hour: number): DayTheme {
  if (hour < 5) return THEMES.night;
  if (hour < 8) return THEMES.dawn;
  if (hour < 11) return THEMES.morning;
  if (hour < 16) return THEMES.noon;
  if (hour < 19) return THEMES.evening;
  if (hour < 21) return THEMES.dusk;
  return THEMES.night;
}

export function themeVars(theme: DayTheme): React.CSSProperties {
  return {
    "--sky-1": theme.sky[0],
    "--sky-2": theme.sky[1],
    "--sky-3": theme.sky[2],
    "--sky-light": theme.light,
    "--sky-bloom": theme.bloom,
    "--sky-ink": theme.ink,
    "--sky-sub-ink": theme.subInk,
    "--sky-panel": theme.panel,
  } as React.CSSProperties;
}
