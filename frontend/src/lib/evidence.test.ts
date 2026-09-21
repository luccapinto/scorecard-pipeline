import { describe, expect, it } from 'vitest';

import { cleanText, closestPassage, locateQuote, quoteIsInTranscript } from './evidence';

// Expected values produced by running the real backend function:
//
//   python -c "from app.text_utils import clean_text; print(clean_text(<input>))"
//
// They are pinned here so a change to the TypeScript port that silently
// diverges from app/text_utils.py fails the build. The port has to agree,
// because the whole quote-to-transcript link depends on both sides
// normalising identically.
const CLEAN_TEXT_CASES: [input: string, expected: string][] = [
  ['Olá, mundo!', 'ola mundo'],
  ['Já configurei o Redis/RQ — com retry.', 'ja configurei o redis rq — com retry'],
  ['  espaços   múltiplos  ', 'espacos multiplos'],
  ['CAIXA-ALTA (com parênteses) e ponto.', 'caixa alta com parenteses e ponto'],
  ['acentuação: ãõçéêíú', 'acentuacao aoceeiu'],
  ['a\tb\nc', 'a b c'],
  ['Vírgula, ponto; dois: pontos... fim!', 'virgula ponto dois pontos fim'],
  ['', ''],
  ['só-hífens---aqui', 'so hifens aqui'],
  ['Test #1 *bold* [x] {y}', 'test 1 bold x y'],
  ["São Paulo's café", 'sao paulo s cafe'],
  ['ÀÉÎÕÜ àéîõü', 'aeiou aeiou'],
];

describe('cleanText', () => {
  it.each(CLEAN_TEXT_CASES)('matches app/text_utils.clean_text for %j', (input, expected) => {
    expect(cleanText(input)).toBe(expected);
  });
});

describe('locateQuote', () => {
  const transcript =
    'Entrevistador: conte sobre filas. Candidato: Eu usei o Redis, com RQ — e retry exponencial ' +
    'quando o job falhava, além de idempotência por external_id.';

  it('finds a quote whose punctuation and case differ from the transcript', () => {
    const match = locateQuote('Com RQ — e retry exponencial!', transcript);
    expect(match).not.toBeNull();
    expect(transcript.slice(match!.start, match!.end)).toContain('RQ');
    expect(transcript.slice(match!.start, match!.end)).toContain('retry exponencial');
  });

  it('does not treat an em dash as punctuation, exactly as the backend does', () => {
    // clean_text's punctuation class is [.,?!_#*()[\]{}:;\-"'/] — it contains
    // the ASCII hyphen but NOT the em dash, so "—" survives normalisation on
    // both sides. A quote that drops it therefore fails the substring rule and
    // falls through to the server's fuzzy comparison. Pinning the behaviour
    // here documents why that fuzzy fallback has to exist at all.
    expect(cleanText('a — b')).toBe('a — b');
    expect(locateQuote('com RQ e retry exponencial', transcript)).toBeNull();
  });

  it('finds a quote that differs only by accents', () => {
    expect(locateQuote('idempotencia por external_id', transcript)).not.toBeNull();
  });

  it('returns null for a quote that is not in the transcript', () => {
    // This is the hallucination case: plausible wording, never said.
    expect(locateQuote('liderei a migração para Kubernetes', transcript)).toBeNull();
  });

  it('returns null for an empty quote', () => {
    expect(locateQuote('   ', transcript)).toBeNull();
  });

  it('maps indices back onto the original, accented text', () => {
    const match = locateQuote('idempotencia', transcript);
    expect(transcript.slice(match!.start, match!.end)).toBe('idempotência');
  });
});

describe('quoteIsInTranscript', () => {
  it('agrees with locateQuote', () => {
    expect(quoteIsInTranscript('Redis', 'usamos Redis aqui')).toBe(true);
    expect(quoteIsInTranscript('Postgres', 'usamos Redis aqui')).toBe(false);
  });
});

describe('closestPassage', () => {
  it('points at the nearest wording for a quote that was not found', () => {
    const transcript = 'Eu configurei o Airflow com backfill diário e alertas no Slack.';
    const result = closestPassage('configurei o Airflow com backfill semanal', transcript);
    expect(result).not.toBeNull();
    expect(result!.similarity).toBeGreaterThan(60);
    expect(transcript.slice(result!.match.start, result!.match.end)).toContain('Airflow');
  });

  it('returns null when there is no transcript to search', () => {
    expect(closestPassage('qualquer coisa', '')).toBeNull();
  });
});
