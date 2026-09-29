import { Icon } from '../../components/ui/Icon';
import { useTour } from './TourProvider';

/** The header's way into the tour — or back into it, where it was left. */
export function TourLauncher() {
  const tour = useTour();
  if (tour === null || tour.current !== null) return null;

  const resuming = tour.resumable !== null;
  return (
    <button
      type="button"
      className="btn btn--tour btn--sm"
      onClick={() => tour.start(tour.resumable ?? 0)}
    >
      <Icon name="play" />
      {resuming ? (
        <>
          Retomar tour
          <span className="btn__meta">
            {tour.resumable! + 1}/{tour.total}
          </span>
        </>
      ) : (
        <>
          Tour guiado
          <span className="btn__meta">2 min</span>
        </>
      )}
    </button>
  );
}
