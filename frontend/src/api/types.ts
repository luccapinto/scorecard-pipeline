// TypeScript mirrors of the backend contract. Source of truth: app/main.py,
// app/models.py (InterviewStatus) and app/scoring.py (scorecard schema).

export type InterviewStatus =
  | 'recebida'
  | 'transcrevendo'
  | 'diarizando'
  | 'pontuando'
  | 'aguardando_aprovacao'
  | 'aprovada'
  | 'rejeitada'
  | 'falhou';

export const INTERVIEW_STATUSES: InterviewStatus[] = [
  'recebida',
  'transcrevendo',
  'diarizando',
  'pontuando',
  'aguardando_aprovacao',
  'aprovada',
  'rejeitada',
  'falhou',
];

// Processing states from which nothing can be decided/reprocessed yet.
export const PROCESSING_STATUSES: InterviewStatus[] = [
  'recebida',
  'transcrevendo',
  'diarizando',
  'pontuando',
];

export type OverallRecommendation = 'Aprovado' | 'Rejeitado' | 'Próxima Etapa';

export interface CompetencyEvaluation {
  competency_name: string;
  score: number; // 1..5 (BARS)
  justification: string;
  evidence_quote: string;
  // true = quote found in transcript; false = likely hallucinated (must be
  // loud in the UI); null = not automatically verified (neutral).
  evidence_verified: boolean | null;
}

export interface Scorecard {
  candidate_name: string;
  overall_recommendation: OverallRecommendation;
  evaluations: CompetencyEvaluation[];
}

// A transcript/diarization segment. `speaker` is absent in local-mode
// transcription_raw; present ("SPEAKER_00", ...) in diarization and Deepgram.
export interface TranscriptSegment {
  speaker?: string | null;
  text: string;
  start?: number | null;
  end?: number | null;
}

// transcription_raw may also arrive as a single string in some modes.
export type RawTranscription = TranscriptSegment[] | string | null;

export interface Interview {
  id: string;
  recording_url: string;
  status: InterviewStatus;
  job_id: string | null;
  external_id: string | null;
  transcription_raw: RawTranscription;
  diarization_raw: TranscriptSegment[] | null;
  scorecard: Scorecard | null;
  error_log: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface Job {
  job_id: string;
  title: string;
}

export interface Recording {
  path: string;
  filename: string;
}

export type DecisionAction = 'approve' | 'reject';

export interface CreateInterviewPayload {
  recording_url: string;
  job_id: string;
  external_id?: string | null;
}

export interface CreateInterviewResponse {
  interview_id: string;
  status: InterviewStatus;
  deduplicated?: boolean;
}

export interface ActionResponse {
  interview_id: string;
  status: InterviewStatus;
  updated_at: string;
}

export type Health =
  | { status: 'ok' }
  | { status: 'unhealthy'; problems: Record<string, string> };
