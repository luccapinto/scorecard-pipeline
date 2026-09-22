// Locating an evidence quote inside a transcript.
//
// The backend decides `evidence_verified` with `app/scoring.py`
// (EvidenceValidator): normalise both sides with `app/text_utils.clean_text`,
// accept an exact substring, otherwise accept a rapidfuzz `partial_ratio`
// above EVIDENCE_MATCH_THRESHOLD (90 by default).
//
// The client re-does the *normalised substring* half of that, for two reasons:
//
//  1. To highlight the quote inside the transcript, which is what turns
//     "evidence verified" from a badge into something a reviewer can check
//     with their own eyes in one click.
//  2. To show, when the flag is `false`, that the search genuinely finds
//     nothing — the substance behind the alarm.
//
// The fuzzy half is approximated (`closestPassage`) and used ONLY as a "did
// you mean this passage?" hint. It never overrides the server's verdict: the
// server ran the real rapidfuzz comparison against the real transcript, and
// its answer is the one displayed.

const COMBINING_MARK = /\p{Mn}/u;
// Exactly the punctuation class of app/text_utils.py::clean_text.
const PUNCTUATION = /[.,?!_#*()[\]{}:;\-"'/]/;

export interface NormalizedText {
  /** The cleaned string, comparable with the backend's clean_text output. */
  text: string;
  /** map[i] = index in the ORIGINAL string that produced cleaned char i. */
  map: number[];
}

/**
 * Port of app/text_utils.py::clean_text that also records where every
 * surviving character came from, so a match can be mapped back onto the
 * original text for highlighting.
 */
export function normalizeWithMap(input: string): NormalizedText {
  const chars: string[] = [];
  const map: number[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const decomposed = input[index].toLowerCase().normalize('NFD');
    for (const char of decomposed) {
      if (COMBINING_MARK.test(char)) continue;
      const emitted = PUNCTUATION.test(char) ? ' ' : char;
      // Collapse whitespace runs as clean_text's " ".join(text.split()) does.
      if (/\s/.test(emitted)) {
        if (chars.length === 0 || chars[chars.length - 1] === ' ') continue;
        chars.push(' ');
        map.push(index);
        continue;
      }
      chars.push(emitted);
      map.push(index);
    }
  }

  while (chars.length > 0 && chars[chars.length - 1] === ' ') {
    chars.pop();
    map.pop();
  }

  return { text: chars.join(''), map };
}

export function cleanText(input: string): string {
  return normalizeWithMap(input).text;
}

export interface QuoteMatch {
  /** Inclusive start index in the original transcript string. */
  start: number;
  /** Exclusive end index in the original transcript string. */
  end: number;
}

/**
 * Finds the quote in the transcript using the backend's normalisation rules.
 * Returns `null` when the normalised quote is not a substring — which is
 * exactly the condition that makes the backend flag a hallucination.
 */
export function locateQuote(quote: string, transcript: string): QuoteMatch | null {
  const needle = cleanText(quote);
  if (!needle) return null;

  const haystack = normalizeWithMap(transcript);
  const at = haystack.text.indexOf(needle);
  if (at === -1) return null;

  const start = haystack.map[at];
  const lastCharIndex = haystack.map[at + needle.length - 1];
  return { start, end: lastCharIndex + 1 };
}

/** Length of the longest common subsequence, used for an indel-based ratio. */
function lcsLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  // Single-row DP: the transcripts here are paragraphs, not books, and the
  // needle is one sentence, so O(n*m) time with O(m) memory is comfortable.
  let previous = new Uint32Array(b.length + 1);
  let current = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] =
        a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  return previous[b.length];
}

export interface ClosestPassage {
  /** Similarity 0-100, comparable in spirit to rapidfuzz partial_ratio. */
  similarity: number;
  match: QuoteMatch;
}

// Scanning every offset would be quadratic in the transcript length for no
// visible benefit: this only powers a "closest passage" hint.
const MAX_WINDOWS = 400;

/**
 * Best-effort nearest passage, for the "the search found nothing — the
 * closest wording was this" hint on a flagged quote. An approximation of
 * rapidfuzz's partial_ratio, never a verdict.
 */
export function closestPassage(quote: string, transcript: string): ClosestPassage | null {
  const needle = cleanText(quote);
  const haystack = normalizeWithMap(transcript);
  if (!needle || !haystack.text) return null;

  const windowSize = Math.min(needle.length, haystack.text.length);
  const lastOffset = haystack.text.length - windowSize;
  if (lastOffset < 0) return null;

  const stride = Math.max(1, Math.ceil((lastOffset + 1) / MAX_WINDOWS));

  let best = -1;
  let bestOffset = 0;
  for (let offset = 0; offset <= lastOffset; offset += stride) {
    const window = haystack.text.slice(offset, offset + windowSize);
    const common = lcsLength(needle, window);
    const similarity = (2 * common * 100) / (needle.length + window.length);
    if (similarity > best) {
      best = similarity;
      bestOffset = offset;
    }
  }

  if (best < 0) return null;

  const start = haystack.map[bestOffset];
  const endIndex = Math.min(bestOffset + windowSize, haystack.map.length) - 1;
  return {
    similarity: Math.round(best),
    match: { start, end: haystack.map[endIndex] + 1 },
  };
}

/**
 * The verification the backend performs, re-run on the substring rule only.
 * Used by the demo source to DERIVE `evidence_verified` instead of hardcoding
 * it, so a flagged quote in the demo is genuinely a quote that is not in the
 * transcript.
 */
export function quoteIsInTranscript(quote: string, transcript: string): boolean {
  return locateQuote(quote, transcript) !== null;
}
