// Obviously-synthetic fixtures for tests. Never real candidate data.
import type { Interview, InterviewStatus, Scorecard } from '../api/types';

export const syntheticScorecard: Scorecard = {
  candidate_name: 'Candidata Exemplo',
  overall_recommendation: 'Próxima Etapa',
  evaluations: [
    {
      competency_name: 'Comunicação',
      score: 4,
      justification: 'Explicou o raciocínio de forma clara (dado sintético).',
      evidence_quote: 'eu costumo desenhar o fluxo antes de escrever qualquer código',
      evidence_verified: true,
    },
    {
      competency_name: 'Design de Sistemas',
      score: 2,
      justification: 'Justificativa sintética sem lastro na transcrição.',
      evidence_quote: 'já reescrevi o kernel do Linux durante um fim de semana',
      evidence_verified: false,
    },
    {
      competency_name: 'Trabalho em Equipe',
      score: 3,
      justification: 'Citação não verificada automaticamente (dado sintético).',
      evidence_quote: 'gosto de revisar PRs dos colegas',
      evidence_verified: null,
    },
  ],
};

export function makeInterview(
  status: InterviewStatus,
  overrides: Partial<Interview> = {},
): Interview {
  return {
    id: `00000000-0000-0000-0000-${status.padEnd(12, '0').slice(0, 12)}`,
    recording_url: '/srv/app/data/synthetic/interview_exemplo.wav',
    status,
    job_id: 'python_pleno',
    external_id: null,
    transcription_raw: null,
    diarization_raw: null,
    scorecard: null,
    error_log: null,
    retry_count: 0,
    created_at: '2026-07-21T12:00:00Z',
    updated_at: '2026-07-21T12:05:00Z',
    ...overrides,
  };
}
