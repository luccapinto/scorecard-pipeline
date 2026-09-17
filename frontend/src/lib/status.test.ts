import { describe, expect, it } from 'vitest';

import { makeInterview } from '../test/fixtures';
import {
  countByStatus,
  countNeedsAction,
  filterInterviews,
  hasLiveWork,
  needsAction,
  sortByActionPriority,
  statusMeta,
} from './status';

describe('status metadata', () => {
  it('classifies each status into the right category', () => {
    expect(statusMeta('pontuando').category).toBe('processing');
    expect(statusMeta('aguardando_aprovacao').category).toBe('action_required');
    expect(statusMeta('falhou').category).toBe('action_required');
    expect(statusMeta('aprovada').category).toBe('done');
    expect(statusMeta('rejeitada').category).toBe('done');
  });

  it('flags exactly the human-action statuses', () => {
    expect(needsAction('aguardando_aprovacao')).toBe(true);
    expect(needsAction('falhou')).toBe(true);
    expect(needsAction('transcrevendo')).toBe(false);
    expect(needsAction('aprovada')).toBe(false);
  });
});

describe('countByStatus', () => {
  it('counts interviews per status and zero-fills the rest', () => {
    const interviews = [
      makeInterview('recebida'),
      makeInterview('aguardando_aprovacao'),
      makeInterview('aguardando_aprovacao'),
      makeInterview('falhou'),
    ];
    const counts = countByStatus(interviews);
    expect(counts.aguardando_aprovacao).toBe(2);
    expect(counts.recebida).toBe(1);
    expect(counts.falhou).toBe(1);
    expect(counts.aprovada).toBe(0);
  });

  it('returns all zeros for an empty list', () => {
    const counts = countByStatus([]);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });
});

describe('filterInterviews', () => {
  const interviews = [
    makeInterview('recebida'),
    makeInterview('aguardando_aprovacao'),
    makeInterview('falhou'),
    makeInterview('aprovada'),
  ];

  it('returns everything for "all"', () => {
    expect(filterInterviews(interviews, 'all')).toHaveLength(4);
  });

  it('filters by a concrete status', () => {
    const result = filterInterviews(interviews, 'aprovada');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('aprovada');
  });

  it('groups aguardando_aprovacao + falhou under "action_required"', () => {
    const result = filterInterviews(interviews, 'action_required');
    expect(result.map((i) => i.status).sort()).toEqual(['aguardando_aprovacao', 'falhou']);
  });
});

describe('countNeedsAction', () => {
  it('counts only the action-required statuses', () => {
    const interviews = [
      makeInterview('aguardando_aprovacao'),
      makeInterview('falhou'),
      makeInterview('pontuando'),
      makeInterview('aprovada'),
    ];
    expect(countNeedsAction(interviews)).toBe(2);
  });
});

describe('hasLiveWork', () => {
  it('is true when any interview is still processing', () => {
    expect(hasLiveWork([makeInterview('diarizando'), makeInterview('aprovada')])).toBe(true);
  });
  it('is false when nothing is processing', () => {
    expect(
      hasLiveWork([makeInterview('aguardando_aprovacao'), makeInterview('aprovada')]),
    ).toBe(false);
  });
});

describe('sortByActionPriority', () => {
  it('floats action-required items to the top, preserving order within groups', () => {
    const a = makeInterview('aprovada', { job_id: 'done-1' });
    const b = makeInterview('pontuando', { job_id: 'proc-1' });
    const c = makeInterview('falhou', { job_id: 'act-1' });
    const d = makeInterview('aguardando_aprovacao', { job_id: 'act-2' });
    const sorted = sortByActionPriority([a, b, c, d]);
    expect(sorted.map((i) => i.job_id)).toEqual(['act-1', 'act-2', 'proc-1', 'done-1']);
  });
});
