import { useCallback, useRef, useState } from 'react';

// Windowed list, used only past a threshold.
//
// `GET /interviews` returns everything, so a busy pipeline can hand the list
// screen thousands of rows. Below the threshold, plain rendering wins: it
// keeps native find-in-page, keyboard scrolling and printing intact, which
// windowing quietly breaks. Past it, the DOM cost stops being acceptable and
// we window — with the full count still announced, so assistive tech is not
// told there are only 20 items.

interface Props<T> {
  items: T[];
  /** Below this count the list renders in full. */
  threshold: number;
  /** Fixed row height in px; the window maths assumes uniform rows. */
  rowHeight: number;
  /** Visible viewport height in px. */
  viewportHeight: number;
  /** Rows rendered above and below the viewport, to hide scroll latency. */
  overscan?: number;
  children: (item: T, index: number) => React.ReactNode;
  className?: string;
  'aria-label': string;
}

export function VirtualList<T>({
  items,
  threshold,
  rowHeight,
  viewportHeight,
  overscan = 6,
  children,
  className,
  'aria-label': ariaLabel,
}: Props<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const frame = useRef<number | null>(null);

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const next = event.currentTarget.scrollTop;
    // Coalesce to one state update per frame: scroll fires far faster than
    // React can reconcile, and without this the list stutters on a trackpad.
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setScrollTop(next);
    });
  }, []);

  if (items.length <= threshold) {
    return (
      <ul className={className} aria-label={ariaLabel}>
        {items.map((item, index) => children(item, index))}
      </ul>
    );
  }

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const last = Math.min(items.length, first + visibleCount);

  return (
    <div
      className="virtual"
      style={{ height: viewportHeight }}
      onScroll={onScroll}
      tabIndex={0}
      role="group"
      aria-label={`${ariaLabel} (rolagem virtualizada, ${items.length} itens)`}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        <ul
          className={className}
          aria-label={ariaLabel}
          style={{ position: 'absolute', top: first * rowHeight, left: 0, right: 0 }}
        >
          {items.slice(first, last).map((item, offset) => children(item, first + offset))}
        </ul>
      </div>
    </div>
  );
}
