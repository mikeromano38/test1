/**
 * Theme presets. Colour values come from the validated reference palette in
 * the dataviz method (categorical order is a CVD-safety mechanism, so it is
 * fixed per mode and never cycled). Jev chooses a *preset* and a few
 * independent toggles; the tokens themselves are never generated.
 */

export type Mode = "light" | "dark";
export type Density = "compact" | "comfortable" | "spacious";

export interface ThemeTokens {
  surface: string;
  page: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  grid: string;
  axis: string;
  border: string;
  categorical: string[]; // fixed order, 8 slots
  sequential: string[]; // light -> dark, one hue
  deltaGood: string;
  deltaBad: string;
  emphasisGray: string;
}

export interface ThemePreset {
  id: string;
  label: string;
  description: string; // what Jev reads
  mode: Mode;
  density: Density;
  fontFamily: string;
  baseFontPx: number;
  radiusPx: number;
  tokens: ThemeTokens;
}

const LIGHT: ThemeTokens = {
  surface: "#fcfcfb", page: "#f9f9f7",
  textPrimary: "#0b0b0b", textSecondary: "#52514e", textMuted: "#898781",
  grid: "#e1e0d9", axis: "#c3c2b7", border: "rgba(11,11,11,0.10)",
  categorical: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  sequential: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  deltaGood: "#006300", deltaBad: "#d03b3b", emphasisGray: "#c3c2b7",
};

const DARK: ThemeTokens = {
  surface: "#1a1a19", page: "#0d0d0d",
  textPrimary: "#ffffff", textSecondary: "#c3c2b7", textMuted: "#898781",
  grid: "#2c2c2a", axis: "#383835", border: "rgba(255,255,255,0.10)",
  categorical: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  sequential: ["#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#6da7ec", "#9ec5f4"],
  deltaGood: "#0ca30c", deltaBad: "#e66767", emphasisGray: "#52514e",
};

const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const THEMES: ThemePreset[] = [
  { id: "daylight", label: "Daylight", description: "Light, neutral, comfortable spacing. The safe default for analysts working at a desk.", mode: "light", density: "comfortable", fontFamily: SANS, baseFontPx: 14, radiusPx: 10, tokens: LIGHT },
  { id: "midnight", label: "Midnight", description: "Dark surface with the same palette re-stepped for dark mode. For wall screens, dark-mode users and evening monitoring.", mode: "dark", density: "comfortable", fontFamily: SANS, baseFontPx: 14, radiusPx: 10, tokens: DARK },
  { id: "boardroom", label: "Boardroom", description: "Light, spacious, larger type, fewer tiles per row. For executives and presentations where a few numbers must be readable from a distance.", mode: "light", density: "spacious", fontFamily: SANS, baseFontPx: 16, radiusPx: 14, tokens: LIGHT },
  { id: "ops_dense", label: "Ops dense", description: "Dark, compact, small type, many tiles per screen. For operators watching many signals at once.", mode: "dark", density: "compact", fontFamily: SANS, baseFontPx: 12, radiusPx: 6, tokens: DARK },
];

export const themeById = (id: string): ThemePreset => {
  const t = THEMES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown theme ${id}`);
  return t;
};

/** Independent presentation toggles Jev decides alongside the preset. */
export interface PresentationOptions {
  numberFormat: "compact" | "precise";
  gridlines: boolean;
  directLabels: boolean;
  sortBreakdowns: "by_value" | "natural";
}

export const NUMBER_FORMATS: Record<PresentationOptions["numberFormat"], string> = {
  compact: "Abbreviated figures such as $1.2M or 34K; scan-friendly",
  precise: "Full figures such as $1,234,567; when exact values matter",
};
