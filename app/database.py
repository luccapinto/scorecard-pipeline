from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

# Create engine. If it's sqlite, we add check_same_thread=False argument
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=False
)

def create_db_and_tables() -> None:
    """Initializes database tables defined in the metadata."""
    SQLModel.metadata.create_all(engine)

def get_session() -> Generator[Session, None, None]:
    """Dependency or utility to get a database session."""
    with Session(engine) as session:
        yield session
