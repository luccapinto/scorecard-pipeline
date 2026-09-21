// Last-request timing, for the observability screen.
//
// Deliberately records the request PATH only — never headers, never the query
// string, never the config. `X-API-Key` must not reach any surface a user can
// read, copy or screenshot, and an observability panel is exactly the kind of
// place that quietly grows a "request details" section.

export interface RequestSample {
  /** Path only, e.g. "/interviews". Never includes host, query or headers. */
  path: string;
  method: string;
  /** Round-trip time in ms. */
  durationMs: number;
  /** HTTP status, or null when fetch itself rejected (offline/CORS/DNS). */
  status: number | null;
  /** Epoch ms when the response settled. */
  at: number;
}

type Listener = (sample: RequestSample) => void;

const listeners = new Set<Listener>();
let last: RequestSample | null = null;

export function recordRequest(sample: RequestSample): void {
  last = sample;
  for (const listener of listeners) listener(sample);
}

export function lastRequest(): RequestSample | null {
  return last;
}

export function subscribeRequests(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: drops recorded state so suites cannot leak into each other. */
export function resetRequestTelemetry(): void {
  last = null;
  listeners.clear();
}
