/**
 * The mark: an opening quotation mark over a highlighter stroke — a citation
 * that was checked. It is the product in one glyph, so it is drawn, not typed:
 * a font-rendered quote would change shape with every fallback face.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" className="brand-mark__tile" />
      <rect x="7" y="21.5" width="18" height="4.5" rx="1" className="brand-mark__marker" />
      <path
        className="brand-mark__quote"
        d="M9 20v-5.2c0-3.4 1.7-6 5-7.3l.9 1.7c-1.9.9-2.9 2.3-3 4.1H14V20H9zm9.2 0v-5.2c0-3.4 1.7-6 5-7.3l.9 1.7c-1.9.9-2.9 2.3-3 4.1h2.1V20h-5z"
      />
    </svg>
  );
}

export function BrandWordmark() {
  return (
    <span className="brand__word">
      Scorecard <span className="brand__word-light">Pipeline</span>
    </span>
  );
}
