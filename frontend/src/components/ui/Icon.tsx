// Inline SVG icon set.
//
// Hand-rolled rather than pulled from an icon package: the app needs ~20
// glyphs, and a dependency would ship thousands plus a component layer for
// something that is a `<path d>` lookup. Stroke-based, 24px grid, currentColor
// so every icon themes itself.
//
// Icons are ALWAYS decorative here (`aria-hidden`). Meaning is carried by
// adjacent text or an `aria-label` on the interactive parent — never by the
// glyph alone, which is the WCAG "not by shape/colour alone" rule.

export type IconName =
  | 'dashboard'
  | 'list'
  | 'plus'
  | 'gavel'
  | 'plug'
  | 'pulse'
  | 'settings'
  | 'funnel'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'check'
  | 'alert'
  | 'question'
  | 'chevronRight'
  | 'chevronDown'
  | 'external'
  | 'search'
  | 'copy'
  | 'play'
  | 'rotate'
  | 'close'
  | 'flask'
  | 'quote'
  | 'arrowRight';

const PATHS: Record<IconName, string> = {
  dashboard: 'M3 13h7V3H3v10zm0 8h7v-6H3v6zm11 0h7V11h-7v10zm0-18v6h7V3h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  plus: 'M12 5v14M5 12h14',
  gavel: 'M14 3l7 7-3 3-7-7 3-3zM10.5 6.5L3 14v4h4l7.5-7.5M14 21h8',
  plug: 'M9 3v6M15 3v6M7 9h10v3a5 5 0 01-10 0V9zM12 17v4',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  funnel: 'M3 4h18l-7 8v7l-4 2v-9L3 4z',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  check: 'M20 6L9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  question: 'M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  chevronRight: 'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  external: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  copy: 'M9 9h10v12H9zM5 15H3V3h12v2',
  play: 'M6 4l14 8-14 8V4z',
  rotate: 'M21 2v6h-6M3 12a9 9 0 0115.5-6.4L21 8M3 22v-6h6M21 12a9 9 0 01-15.5 6.4L3 16',
  close: 'M18 6L6 18M6 6l12 12',
  flask: 'M9 2v7L3.4 18.6A2 2 0 005.1 21.6h13.8a2 2 0 001.7-3L15 9V2M8 2h8M7.5 14h9',
  quote:
    'M7 7h4v4c0 2.2-1.8 4-4 4V7zM15 7h4v4c0 2.2-1.8 4-4 4V7z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
};

interface Props {
  name: IconName;
  /** Pixel size; defaults to 1em so the icon tracks the surrounding text. */
  size?: number | string;
  className?: string;
}

export function Icon({ name, size = '1.1em', className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
