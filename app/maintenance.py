"""
Operational maintenance routines:

- requeue_stale_interviews: reconciliation for the dual-write gap between
  PostgreSQL and Redis. If the API persisted an interview but the enqueue
  failed (or the job was lost), the row stays in RECEBIDA forever; this
  routine re-enqueues rows older than a threshold. Processing is idempotent
  (checkpointed), so re-enqueueing an already-queued interview is safe.
- purge_old_interviews: LGPD retention — deletes interviews in terminal
  states older than RETENTION_DAYS (0 disables purging).

Run periodically (cron) via `python -m app.maintenance`.
"""
import logging
from datetime import timedelta
from typing import List

from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.models import Interview, InterviewStatus, TERMINAL_STATUSES, utcnow

logger = logging.getLogger(__name__)


def requeue_stale_interviews(max_age_minutes: int = None) -> List[str]:
    """Re-enqueues RECEBIDA interviews older than the threshold. Returns their ids."""
    from app.queue import enqueue_processing

    max_age = max_age_minutes or settings.stale_recebida_max_age_minutes
    cutoff = utcnow() - timedelta(minutes=max_age)
    requeued = []
    with Session(engine) as session:
        statement = select(Interview).where(
            Interview.status == InterviewStatus.RECEBIDA,
            Interview.updated_at < cutoff,
        )
        for interview in session.exec(statement).all():
            logger.info(f"Re-enqueueing stale interview {interview.id}")
            enqueue_processing(str(interview.id))
            requeued.append(str(interview.id))
    return requeued


def purge_old_interviews(retention_days: int = None) -> int:
    """Deletes terminal-state interviews older than the retention window."""
    days = retention_days if retention_days is not None else settings.retention_days
    if days <= 0:
        logger.info("Retention purging is disabled (RETENTION_DAYS=0).")
        return 0
    cutoff = utcnow() - timedelta(days=days)
    purged = 0
    with Session(engine) as session:
        statement = select(Interview).where(
            Interview.status.in_(list(TERMINAL_STATUSES)),  # type: ignore[attr-defined]
            Interview.updated_at < cutoff,
        )
        for interview in session.exec(statement).all():
            logger.info(f"Purging interview {interview.id} (retention: {days} days)")
            session.delete(interview)
            purged += 1
        session.commit()
    return purged


if __name__ == "__main__":
    from app.logging_config import setup_logging

    setup_logging()
    ids = requeue_stale_interviews()
    logger.info(f"Requeued {len(ids)} stale interview(s).")
    count = purge_old_interviews()
    logger.info(f"Purged {count} interview(s) past retention.")
