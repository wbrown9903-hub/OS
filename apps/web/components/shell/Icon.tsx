import type { CSSProperties } from "react";

/**
 * The shell's icon set.
 *
 * Icons are named with the SF Symbols vocabulary the configuration document and
 * the widget definitions already use, so a widget author writes `icon: "cart"`
 * once and it renders in the native shell, the dock, the launcher and the
 * palette. An unknown name draws a neutral placeholder rather than nothing, so a
 * document from a newer version can never produce an invisible control.
 */

type PathSet = string[];

const ICONS: Record<string, PathSet> = {
  "square.grid.2x2": ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"],
  "square.grid.3x3": [
    "M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z",
  ],
  "rectangle.3.group": ["M3 4h18v6H3z", "M3 14h8v6H3z", "M13 14h8v6h-8z"],
  sparkles: ["M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z", "M18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1-2.1-.9 2.1-.9z"],
  brain: [
    "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V15a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z",
    "M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V15a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  ],
  cart: ["M3 5h2l2.3 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H6", "M9 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"],
  gamecontroller: [
    "M7 8h10a4 4 0 0 1 4 4v3a3 3 0 0 1-5.4 1.8L14.2 15H9.8l-1.4 1.8A3 3 0 0 1 3 15v-3a4 4 0 0 1 4-4z",
    "M7.5 11v2.5M6.25 12.25h2.5M16 11.5h.01M18 13.5h.01",
  ],
  flowchart: ["M4 3h6v5H4zM14 16h6v5h-6zM4 16h6v5H4z", "M7 8v4h10v4M7 12v4"],
  "puzzlepiece.extension": [
    "M10 3h4v2.2a1.8 1.8 0 1 0 3.6 0V3H21v4.4h-2.2a1.8 1.8 0 1 0 0 3.6H21V21h-6.4v-2.2a1.8 1.8 0 1 0-3.6 0V21H4v-6.4h2.2a1.8 1.8 0 1 0 0-3.6H4V3z",
  ],
  "bitcoinsign.circle": ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M9.5 8h4a2 2 0 0 1 0 4h-4zM9.5 12h4.5a2 2 0 0 1 0 4H9.5zM11 6v2M11 16v2M13.5 6v2M13.5 16v2"],
  gearshape: [
    "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
    "M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.4-2-3.4-2.2.9a7.6 7.6 0 0 0-2.6-1.5L14.2 2h-4l-.3 2.4a7.6 7.6 0 0 0-2.6 1.5l-2.2-.9-2 3.4 1.9 1.4a7.6 7.6 0 0 0 0 3L3.1 14.9l2 3.4 2.2-.9a7.6 7.6 0 0 0 2.6 1.5l.3 2.4h4l.3-2.4a7.6 7.6 0 0 0 2.6-1.5l2.2.9 2-3.4z",
  ],
  "questionmark.circle": ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M9.3 9.2a2.8 2.8 0 1 1 3.4 3.3v1.6M12 17.2h.01"],
  paintpalette: [
    "M12 3a9 9 0 0 0 0 18c1.2 0 2-.9 2-1.9 0-.6-.3-1-.6-1.4a1.9 1.9 0 0 1 1.4-3.2H17a4 4 0 0 0 4-4c0-4.1-4-7.5-9-7.5z",
    "M7.5 11.5h.01M10 8h.01M14 8h.01M16.5 11h.01",
  ],
  link: ["M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7L11.4 6.4", "M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.4-1.4"],
  "lock.shield": ["M12 3l7 3v5.5c0 4.4-3 8.1-7 9.5-4-1.4-7-5.1-7-9.5V6z", "M10 12v-1.5a2 2 0 1 1 4 0V12M9.5 12h5v4h-5z"],
  desktopcomputer: ["M3 4h18v11H3z", "M9 19h6M12 15v4"],
  "hand.raised": ["M8 11V5.5a1.5 1.5 0 1 1 3 0V11M11 11V4.5a1.5 1.5 0 1 1 3 0V11M14 11V6.5a1.5 1.5 0 1 1 3 0V14a7 7 0 0 1-7 7 7 7 0 0 1-7-7v-2.5a1.5 1.5 0 1 1 3 0V13"],
  "arrow.clockwise.circle": ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M15.5 9.5H18V7M17.6 9.4A6 6 0 1 0 18 12"],
  "arrow.clockwise": ["M19 5.5V10h-4.5", "M19.2 10a7.5 7.5 0 1 0-.6 5"],
  lifepreserver: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z", "M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"],
  "info.circle": ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M12 11v6M12 7.6h.01"],
  bell: ["M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z", "M10 19a2 2 0 0 0 4 0"],
  magnifyingglass: ["M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z", "M16.2 16.2L21 21"],
  xmark: ["M6 6l12 12M18 6L6 18"],
  checkmark: ["M5 12.5l4.5 4.5L19 7"],
  "chevron.down": ["M6 9.5l6 6 6-6"],
  "chevron.right": ["M9.5 6l6 6-6 6"],
  "chevron.left": ["M14.5 6l-6 6 6 6"],
  "chevron.up": ["M6 14.5l6-6 6 6"],
  "arrow.uturn.backward": ["M9 7L4.5 11.5 9 16", "M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-3"],
  "arrow.uturn.forward": ["M15 7l4.5 4.5L15 16", "M19.5 11.5H9a4.5 4.5 0 0 0 0 9h3"],
  "rectangle.portrait.and.arrow.right": ["M14 4H5v16h9", "M11 12h10M17.5 8.5L21 12l-3.5 3.5"],
  "exclamationmark.triangle": ["M12 4l9 16H3z", "M12 10v4.5M12 17.2h.01"],
  wifi: ["M2.5 9a15 15 0 0 1 19 0", "M6 12.5a10 10 0 0 1 12 0", "M9.5 16a5 5 0 0 1 5 0", "M12 19.4h.01"],
  bolt: ["M13.5 3L5.5 13.5H11l-.5 7.5 8-10.5H13z"],
  checklist: ["M4 6.5l2 2 3-3M4 15.5l2 2 3-3", "M12 7h8M12 16h8"],
  "hand.wave": ["M7 13.5V6a1.5 1.5 0 1 1 3 0v5.5M10 11.5V4.5a1.5 1.5 0 1 1 3 0V11M13 11V6.5a1.5 1.5 0 1 1 3 0V14a6.5 6.5 0 0 1-11.9 3.6L4 16"],
  "waveform.path.ecg": ["M3 12.5h4l2-5 3 10 2.5-6 1.5 3H21"],
  "wand.and.rays": ["M5 19L16 8", "M17.5 3v3M17.5 12v3M13 7.5h3M20 7.5h3", "M15 5.5l1.5 1.5M19.5 5.5L18 7"],
  "arrow.up.left.and.arrow.down.right": ["M9 4H4v5M4 4l6 6", "M15 20h5v-5M20 20l-6-6"],
  plus: ["M12 5v14M5 12h14"],
  ellipsis: ["M6 12h.01M12 12h.01M18 12h.01"],
  "arrow.up.right.square": ["M4 4h16v16H4z", "M9.5 14.5L15 9M10 9h5v5"],
  "slider.horizontal.3": ["M3 7h18M3 12h18M3 17h18", "M8 7v0M15 12v0M11 17v0"],
  moon: ["M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"],
  "sun.max": ["M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z", "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"],
  eye: ["M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z", "M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"],
  trash: ["M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"],
  "doc.text": ["M6 3h8l4 4v14H6z", "M14 3v4h4M9 12h6M9 16h6"],
  clock: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M12 7v5.5l3.5 2"],
  "person.crop.circle": ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M12 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6z", "M6 19a6.5 6.5 0 0 1 12 0"],
  "square.stack": ["M7 8h13v13H7z", "M4 16V4h12"],
  "lock.open": ["M6 11h12v9H6z", "M9 11V7a3 3 0 0 1 6 0"],
  "externaldrive": ["M3 12h18v7H3z", "M5.5 5h13l2.5 7H3z", "M6.5 15.5h.01M10 15.5h4"],
};

const FALLBACK: PathSet = ["M5 5h14v14H5z", "M9.5 12h5"];

export interface IconProps {
  name: string;
  size?: number;
  /** Icons are decorative by default; give a label when the icon is the only content. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 18, label, className, style }: IconProps) {
  const paths = ICONS[name] ?? FALLBACK;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : "presentation"}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      focusable="false"
    >
      {paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}

export function hasIcon(name: string): boolean {
  return name in ICONS;
}
