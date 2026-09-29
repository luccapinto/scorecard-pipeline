// The spotlight and the coachmark.
//
// Four blockers frame a hole around the target: the rest of the page is
// dimmed and inert to the pointer, while the spotlighted element stays live —
// "Pode testar" means it. The coachmark is a modal dialog for keyboard and
// screen-reader users: focus moves to its title on every step, Tab cycles
// inside it, arrows move through the tour, and Esc leaves it (the page is then
// fully usable, and the header offers to resume).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAnnouncer } from '../../components/ui/Announcer';
import { Icon } from '../../components/ui/Icon';
import type { TourStep } from './steps';
import type { TourApi } from './TourProvider';

interface Props {
  step: TourStep;
  index: number;
  api: TourApi;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Breathing room between the target's edge and the spotlight's edge. */
const PAD = 8;
const GAP = 14;
const MARGIN = 16;
/** Below this width the coachmark becomes a bottom sheet. */
const SHEET_BELOW = 720;

function mastheadHeight(): number {
  return document.querySelector('.masthead')?.getBoundingClientRect().height ?? 0;
}

/**
 * Scrolls so the target sits in the space the coachmark leaves free. Manual
 * `scrollTo` rather than `scrollIntoView`: the latter also scrolls inner
 * containers and cannot account for the sticky header or the bottom sheet.
 */
function bringIntoView(element: Element, reserveBottom: number): void {
  const rect = element.getBoundingClientRect();
  const top = mastheadHeight() + MARGIN;
  const available = window.innerHeight - top - reserveBottom - MARGIN;
  const absoluteTop = window.scrollY + rect.top;
  const y =
    rect.height >= available
      ? absoluteTop - top
      : absoluteTop - top - (available - rect.height) / 2;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, y), behavior: reduced ? 'auto' : 'smooth' });
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function TourOverlay({ step, index, api }: Props) {
  const { announce } = useAnnouncer();
  const [hole, setHole] = useState<Box | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [popHeight, setPopHeight] = useState(260);
  const popRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<Element | null>(null);

  const last = index === api.total - 1;
  const sheet = viewport.width < SHEET_BELOW;

  // Where focus goes back to when the tour closes.
  useEffect(() => {
    returnFocus.current = document.activeElement;
    return () => {
      const target = returnFocus.current;
      if (target instanceof HTMLElement && target.isConnected && target !== document.body) {
        target.focus({ preventScroll: true });
      } else {
        document.getElementById('conteudo')?.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    announce(`Tour guiado, passo ${index + 1} de ${api.total}: ${step.title}.`);
  }, [index, api.total, step.title, announce]);

  useLayoutEffect(() => {
    if (popRef.current) setPopHeight(popRef.current.offsetHeight);
  }, [index, viewport.width]);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Follow the target every frame: it may mount late (data still loading),
  // move (a card gliding between columns) or scroll. One rect read per frame
  // for one element is cheap, and it is the only approach that never lags.
  useEffect(() => {
    let frame = 0;
    let scrolled = false;
    let lastKey = '';
    const schedule = window.requestAnimationFrame ?? ((fn: FrameRequestCallback) => window.setTimeout(fn, 16));
    const cancel = window.cancelAnimationFrame ?? window.clearTimeout;
    const tick = () => {
      const element = document.querySelector(step.target);
      if (element === null) {
        if (lastKey !== 'none') {
          lastKey = 'none';
          setHole(null);
        }
      } else {
        if (!scrolled) {
          scrolled = true;
          // Reserve room under the target for the coachmark whenever it cannot
          // sit beside it: always on a phone (bottom sheet), and on a desktop
          // when the target spans too much of the width.
          const rect = element.getBoundingClientRect();
          const popWidth = Math.min(400, window.innerWidth - MARGIN * 2);
          const sideRoom =
            rect.left - GAP - popWidth >= MARGIN ||
            rect.right + GAP + popWidth <= window.innerWidth - MARGIN;
          const popHeight = popRef.current?.offsetHeight ?? 280;
          bringIntoView(
            element,
            window.innerWidth < SHEET_BELOW || !sideRoom ? popHeight + GAP : 0,
          );
        }
        const rect = element.getBoundingClientRect();
        const key = `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
        if (key !== lastKey) {
          lastKey = key;
          setHole({
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          });
        }
      }
      frame = schedule(tick);
    };
    frame = schedule(tick);
    return () => cancel(frame);
  }, [step.target, index]);

  // Arrows move through the tour, Esc leaves it, Tab stays in the coachmark.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        api.close();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        api.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        api.previous();
      } else if (event.key === 'Tab' && popRef.current !== null) {
        const items = [...popRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const end = items[items.length - 1];
        const inside = popRef.current.contains(document.activeElement);
        if (event.shiftKey && (document.activeElement === first || !inside)) {
          event.preventDefault();
          end.focus();
        } else if (!event.shiftKey && (document.activeElement === end || !inside)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [api]);

  const popWidth = Math.min(400, viewport.width - MARGIN * 2);
  const position = sheet
    ? null
    : placeCoachmark(hole, { width: popWidth, height: popHeight }, viewport, mastheadHeight());

  return createPortal(
    <div className="tour" data-step={step.id}>
      <Blockers hole={hole} viewport={viewport} />
      {hole !== null && (
        <div
          className="tour__ring"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
          aria-hidden="true"
        />
      )}

      <div
        ref={popRef}
        className={`tour-pop ${sheet ? 'tour-pop--sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={position === null ? undefined : { top: position.top, left: position.left, width: popWidth }}
      >
        <div className="tour-pop__top">
          <p className="tour-pop__count">
            Tour guiado <span aria-hidden="true">·</span>{' '}
            <span className="tour-pop__num">
              {index + 1}
              <span className="tour-pop__of"> de {api.total}</span>
            </span>
          </p>
          <button type="button" className="tour-pop__close" onClick={api.close}>
            <Icon name="close" />
            <span className="sr-only">Sair do tour</span>
          </button>
        </div>
        <ol className="tour-pop__progress" aria-hidden="true">
          {Array.from({ length: api.total }, (_, step) => (
            <li
              key={step}
              className={step < index ? 'is-done' : step === index ? 'is-current' : undefined}
            />
          ))}
        </ol>
        <h2 id="tour-title" className="tour-pop__title" tabIndex={-1} ref={titleRef}>
          {step.title}
        </h2>
        <p id="tour-body" className="tour-pop__body">
          {step.body}
        </p>
        <div className="tour-pop__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={api.previous}
            disabled={index === 0}
          >
            Anterior
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={api.next}>
            {last ? 'Concluir tour' : 'Próximo'}
            {!last && <Icon name="arrowRight" />}
          </button>
        </div>
        <p className="tour-pop__keys" aria-hidden="true">
          <kbd>←</kbd> <kbd>→</kbd> navegar <span>·</span> <kbd>Esc</kbd> sair
        </p>
      </div>
    </div>,
    document.body,
  );
}

/** Dims and blocks everything except the hole, which stays interactive. */
function Blockers({ hole, viewport }: { hole: Box | null; viewport: { width: number; height: number } }) {
  if (hole === null) return <div className="tour__block tour__block--full" aria-hidden="true" />;
  const top = Math.max(0, hole.top);
  const bottom = Math.min(viewport.height, hole.top + hole.height);
  const left = Math.max(0, hole.left);
  const right = Math.min(viewport.width, hole.left + hole.width);
  return (
    <>
      <div className="tour__block" style={{ top: 0, left: 0, right: 0, height: top }} aria-hidden="true" />
      <div className="tour__block" style={{ top: bottom, left: 0, right: 0, bottom: 0 }} aria-hidden="true" />
      <div
        className="tour__block"
        style={{ top, left: 0, width: left, height: Math.max(0, bottom - top) }}
        aria-hidden="true"
      />
      <div
        className="tour__block"
        style={{ top, left: right, right: 0, height: Math.max(0, bottom - top) }}
        aria-hidden="true"
      />
    </>
  );
}

/**
 * Below, above, right, left of the target — the first that fits whole. When
 * none does (a target bigger than the screen), the coachmark sits in the
 * bottom-right corner, over the target, which is still dimmed around it.
 */
function placeCoachmark(
  hole: Box | null,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  masthead: number,
): { top: number; left: number } {
  const clampLeft = (value: number) =>
    Math.min(Math.max(value, MARGIN), viewport.width - size.width - MARGIN);
  const clampTop = (value: number) =>
    Math.min(Math.max(value, masthead + MARGIN), viewport.height - size.height - MARGIN);

  if (hole === null) {
    return {
      top: Math.max(masthead + MARGIN, (viewport.height - size.height) / 2),
      left: (viewport.width - size.width) / 2,
    };
  }

  const centeredLeft = clampLeft(hole.left + hole.width / 2 - size.width / 2);
  const below = hole.top + hole.height + GAP;
  if (below + size.height <= viewport.height - MARGIN) return { top: below, left: centeredLeft };

  const above = hole.top - GAP - size.height;
  if (above >= masthead + MARGIN) return { top: above, left: centeredLeft };

  const right = hole.left + hole.width + GAP;
  if (right + size.width <= viewport.width - MARGIN) return { top: clampTop(hole.top), left: right };

  const left = hole.left - GAP - size.width;
  if (left >= MARGIN) return { top: clampTop(hole.top), left };

  return {
    top: viewport.height - size.height - MARGIN,
    left: viewport.width - size.width - MARGIN,
  };
}
