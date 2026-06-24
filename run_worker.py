import redis
import logging
from rq import Worker, Queue, Connection
from app.config import settings

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("rq.worker")

def start_worker():
    logger.info(f"Connecting to Redis at: {settings.redis_url}")
    try:
        redis_conn = redis.from_url(settings.redis_url)
        # Test connection
        redis_conn.ping()
        logger.info("Connected to Redis successfully.")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise e

    with Connection(redis_conn):
        worker = Worker([Queue("default")])
        logger.info("Starting RQ worker listening on queue: 'default'")
        worker.work()

if __name__ == "__main__":
    start_worker()
