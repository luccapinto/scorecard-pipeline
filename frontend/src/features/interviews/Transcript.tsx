import type { RawTranscription, TranscriptSegment } from '../../api/types';
import { formatSeconds } from '../../lib/format';
import { buildTurns, speakerColorIndex } from '../../lib/transcript';

interface Props {
  transcription: RawTranscription;
  diarization: TranscriptSegment[] | null;
}

// Renders the transcript as speaker-labeled turns. Falls back gracefully when
// there is no speaker information (local-mode transcription without diarization).
export function Transcript({ transcription, diarization }: Props) {
  const turns = buildTurns(transcription, diarization);

  if (turns.length === 0) {
    return <p className="transcript__empty">Transcrição ainda não disponível.</p>;
  }

  return (
    <div className="transcript">
      {turns.map((turn, index) => (
        <div
          key={index}
          className={`turn turn--speaker-${speakerColorIndex(turn.speaker)}`}
        >
          <div className="turn__meta">
            <span className="turn__speaker">{turn.speaker ?? 'Fala'}</span>
            {turn.start !== null && (
              <span className="turn__time">{formatSeconds(turn.start)}</span>
            )}
          </div>
          <p className="turn__text">{turn.text}</p>
        </div>
      ))}
    </div>
  );
}
