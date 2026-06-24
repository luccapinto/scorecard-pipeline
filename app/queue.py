import redis
from rq import Queue
from app.config import settings

# Create a Redis connection
redis_conn = redis.from_url(settings.redis_url)

# Create an RQ queue
queue = Queue("default", connection=redis_conn)

def get_queue() -> Queue:
    return queue
