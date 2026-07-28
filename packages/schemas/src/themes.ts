/**
 * Themes are data, not code. Each one is a complete set of tokens, so a theme
 * downloaded from a repository or authored in Nexus Studio is exactly as capable
 * as the six built in here — and none of them can execute anything.
 *
 * All artwork, colour choices and naming are original to Nexus OS.
 */

export interface ThemeTokens {
  /** Page background, painted behind the panels. */
  canvas: string;
  /** Secondary background for inset areas. */
  canvasInset: string;
  /** Panel fill before transparency is applied. */
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentContrast: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  /** Multi-stop gradient used for hero panels and the launcher backdrop. */
  auroraA: string;
  auroraB: string;
  auroraC: string;
  /** Shadow colour, tuned per theme so dark themes do not smear. */
  shadow: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  appearance: "dark" | "light";
  /** Themes designed for accessibility opt out of translucency and glow. */
  highContrast: boolean;
  tokens: ThemeTokens;
}

export const themes: Theme[] = [
  {
    id: "nexus-obsidian",
    name: "Nexus Obsidian",
    description: "Deep graphite with a cool cyan signal. The default Nexus look.",
    appearance: "dark",
    highContrast: false,
    tokens: {
      canvas: "#07090F",
      canvasInset: "#0B0E17",
      surface: "#12172292",
      surfaceRaised: "#181F2E",
      surfaceSunken: "#0A0D14",
      border: "#232C3E",
      borderStrong: "#35415A",
      textPrimary: "#EEF2FA",
      textSecondary: "#A8B4CC",
      textMuted: "#6C7A94",
      accent: "#4CC9F0",
      accentSoft: "#4CC9F033",
      accentContrast: "#04121A",
      success: "#3DDC97",
      warning: "#F5B14C",
      danger: "#FF6B6B",
      info: "#7AA2F7",
      auroraA: "#1B3A6B",
      auroraB: "#0E7490",
      auroraC: "#3B1E6E",
      shadow: "#000000",
    },
  },
  {
    id: "arcane-gold",
    name: "Arcane Gold",
    description: "Warm parchment and antique gold for an adventuring mood. Original artwork throughout.",
    appearance: "dark",
    highContrast: false,
    tokens: {
      canvas: "#0F0B06",
      canvasInset: "#161009",
      surface: "#1E160C96",
      surfaceRaised: "#271D10",
      surfaceSunken: "#100B05",
      border: "#3A2C18",
      borderStrong: "#5A452A",
      textPrimary: "#F6ECD8",
      textSecondary: "#CBB68E",
      textMuted: "#8A7855",
      accent: "#E0A63C",
      accentSoft: "#E0A63C2E",
      accentContrast: "#1A1204",
      success: "#8FBF54",
      warning: "#E8B34A",
      danger: "#D2593F",
      info: "#C2A36B",
      auroraA: "#5A3B12",
      auroraB: "#8A5A18",
      auroraC: "#2E1F0A",
      shadow: "#000000",
    },
  },
  {
    id: "clean-studio",
    name: "Clean Studio",
    description: "Bright, quiet and neutral. Designed for long working days in daylight.",
    appearance: "light",
    highContrast: false,
    tokens: {
      canvas: "#F4F6FA",
      canvasInset: "#EAEEF5",
      surface: "#FFFFFFCC",
      surfaceRaised: "#FFFFFF",
      surfaceSunken: "#E8ECF3",
      border: "#D9DFEA",
      borderStrong: "#B9C3D4",
      textPrimary: "#141A24",
      textSecondary: "#4A5768",
      textMuted: "#7A8698",
      accent: "#2C6BED",
      accentSoft: "#2C6BED1F",
      accentContrast: "#FFFFFF",
      success: "#1E9E6A",
      warning: "#B87503",
      danger: "#C8372D",
      info: "#2C6BED",
      auroraA: "#C9D9F5",
      auroraB: "#DCE6F7",
      auroraC: "#EAD9F2",
      shadow: "#1B2436",
    },
  },
  {
    id: "cyber-command",
    name: "Cyber Command",
    description: "High-signal control-room palette with sharp edges and vivid status colours.",
    appearance: "dark",
    highContrast: false,
    tokens: {
      canvas: "#04070A",
      canvasInset: "#070C12",
      surface: "#0A131C9E",
      surfaceRaised: "#0F1B26",
      surfaceSunken: "#050A0F",
      border: "#14293A",
      borderStrong: "#1F4459",
      textPrimary: "#E6FBFF",
      textSecondary: "#93C4D6",
      textMuted: "#5B8299",
      accent: "#00E5A0",
      accentSoft: "#00E5A02B",
      accentContrast: "#00110B",
      success: "#00E5A0",
      warning: "#FFC53D",
      danger: "#FF4D6D",
      info: "#3AB7FF",
      auroraA: "#06304A",
      auroraB: "#00584A",
      auroraC: "#0B2036",
      shadow: "#000000",
    },
  },
  {
    id: "minimal-productivity",
    name: "Minimal Productivity",
    description: "Almost no decoration. Maximum room for content and text.",
    appearance: "dark",
    highContrast: false,
    tokens: {
      canvas: "#111213",
      canvasInset: "#151617",
      surface: "#1B1D1FD9",
      surfaceRaised: "#212426",
      surfaceSunken: "#0D0E0F",
      border: "#2A2D30",
      borderStrong: "#3D4145",
      textPrimary: "#F2F3F4",
      textSecondary: "#AFB3B7",
      textMuted: "#767B80",
      accent: "#B7BDC4",
      accentSoft: "#B7BDC422",
      accentContrast: "#111213",
      success: "#6FBF8B",
      warning: "#D6A756",
      danger: "#D9736E",
      info: "#8FA8C4",
      auroraA: "#1A1C1E",
      auroraB: "#202325",
      auroraC: "#161819",
      shadow: "#000000",
    },
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum legibility. No translucency, no glow, thick focus rings.",
    appearance: "dark",
    highContrast: true,
    tokens: {
      canvas: "#000000",
      canvasInset: "#000000",
      surface: "#000000",
      surfaceRaised: "#0A0A0A",
      surfaceSunken: "#000000",
      border: "#FFFFFF",
      borderStrong: "#FFFFFF",
      textPrimary: "#FFFFFF",
      textSecondary: "#FFFFFF",
      textMuted: "#D8D8D8",
      accent: "#FFD400",
      accentSoft: "#FFD40033",
      accentContrast: "#000000",
      success: "#00FF95",
      warning: "#FFD400",
      danger: "#FF5C5C",
      info: "#5CC8FF",
      auroraA: "#000000",
      auroraB: "#000000",
      auroraC: "#000000",
      shadow: "#000000",
    },
  },
];

export const defaultThemeId = "nexus-obsidian";

export function themeById(id: string): Theme {
  return themes.find((theme) => theme.id === id) ?? themes[0]!;
}

/** Emits the CSS custom properties for a theme. Consumed by the shell's root element. */
export function themeCSSVariables(theme: Theme): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.tokens)) {
    variables[`--nx-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`] = value;
  }
  variables["--nx-appearance"] = theme.appearance;
  return variables;
}

/**
 * Relative luminance and contrast ratio, used by the theme editor to warn when a
 * custom colour pair would fail WCAG AA before the user saves it.
 */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const normalized = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
    const channels = [0, 2, 4].map((offset) => {
      const value = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrastAA(foreground: string, background: string, largeText = false): boolean {
  return contrastRatio(foreground, background) >= (largeText ? 3 : 4.5);
}
