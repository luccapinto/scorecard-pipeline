// Small formatting helpers (pt-BR).

// The backend serializes timestamps without a timezone designator (e.g.
// "2026-07-21T23:39:10.380628"), but they are UTC (utcnow). A designator-less
// ISO string is parsed as *local* time by Date, which would skew relative
// ages by the viewer's offset — so we append "Z" to force UTC. Returns an
// Invalid Date only for genuinely unparseable input, which callers guard.
export function parseTimestamp(iso: string): Date {
  const hasTz = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasTz ? iso : `${iso}Z`);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = parseTimestamp(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

// Compact relative-ish age, e.g. "há 3 min", for the live list.
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const date = parseTimestamp(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 60) return 'agora há pouco';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}

export function formatSeconds(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

// Coarse duration, for "waiting for 2 h 10 min" style labels. Deliberately
// drops detail above an hour: a queue age of "2 h" is actionable,
// "2 h 10 min 4 s" is noise.
export function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days} d` : `${days} d ${restHours} h`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatScore(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '—';
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace('.', ',');
}
