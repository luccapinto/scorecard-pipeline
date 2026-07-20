import redis
from rq import Queue, Retry

from app.config import settings

# Create a Redis connection
redis_conn = redis.from_url(settings.redis_url)

# Create an RQ queue
queue = Queue("default", connection=redis_conn)

def get_queue() -> Queue:
    return queue

def enqueue_processing(interview_id: str):
    """
    Enqueues the interview-processing task with a timeout sized for long
    audio jobs and automatic retries with backoff for transient failures.
    """
    from app.tasks import process_interview

    q = get_queue()
    return q.enqueue(
        process_interview,
        interview_id,
        job_timeout=settings.job_timeout_seconds,
        retry=Retry(max=settings.job_max_retries, interval=[60, 300, 900]),
        failure_ttl=7 * 24 * 3600,
    )
