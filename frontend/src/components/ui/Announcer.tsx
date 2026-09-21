// Screen-reader announcements for changes the user did not trigger.
//
// This UI repaints itself from a poll: an interview silently moves from
// `pontuando` to `aguardando_aprovacao` while you are reading. Sighted users
// notice the badge change. Without a live region, a screen-reader user is
// simply told nothing — the screen they are on has become a different screen.
// That is hostile, and on a decision interface it is a functional defect, not
// a polish item.
//
// Two regions, because politeness is not one-size: routine progress is
// `polite` (queued behind whatever is being read), failures are `assertive`.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type Politeness = 'polite' | 'assertive';

interface AnnouncerApi {
  announce: (message: string, politeness?: Politeness) => void;
}

const AnnouncerContext = createContext<AnnouncerApi | null>(null);

export function useAnnouncer(): AnnouncerApi {
  const api = useContext(AnnouncerContext);
  // Announcing is a progressive enhancement: a component rendered outside the
  // provider (isolated unit test) must not crash.
  return api ?? NOOP_ANNOUNCER;
}

const NOOP_ANNOUNCER: AnnouncerApi = { announce: () => {} };

export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  // Repeating an identical string into a live region announces nothing in
  // most screen readers. A zero-width counter suffix forces a re-announce
  // without changing what the user hears.
  const nonce = useRef(0);

  const announce = useCallback((message: string, politeness: Politeness = 'polite') => {
    nonce.current += 1;
    const padded = message + '\u200b'.repeat(nonce.current % 2);
    if (politeness === 'assertive') setAssertive(padded);
    else setPolite(padded);
  }, []);

  const api = useMemo(() => ({ announce }), [announce]);

  return (
    <AnnouncerContext.Provider value={api}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}
